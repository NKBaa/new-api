package controller

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

var (
	memIPCheckinMutex  sync.Mutex
	memIPCheckinDate   string
	memIPCheckinTokens = make(map[string]map[string]struct{})
)

const checkinRateLimitScript = `
local key = KEYS[1]
local maxCount = tonumber(ARGV[1])
local token = ARGV[2]
local expireSecs = tonumber(ARGV[3])

local count = redis.call('SCARD', key)
if count < maxCount then
    redis.call('SADD', key, token)
    redis.call('EXPIRE', key, expireSecs)
    return 1
else
    return 0
end
`

// isAutomatedUserAgent 识别常见自动化脚本和 HTTP 客户端库
func isAutomatedUserAgent(ua string) bool {
	trimmed := strings.TrimSpace(ua)
	if trimmed == "" {
		return true
	}
	lower := strings.ToLower(trimmed)
	automatedSignatures := []string{
		"python-requests",
		"aiohttp",
		"httpx",
		"axios",
		"node-fetch",
		"got/",
		"undici",
		"curl/",
		"wget/",
		"postmanruntime",
		"go-http-client",
		"urllib",
		"scrapy",
	}
	for _, sig := range automatedSignatures {
		if strings.Contains(lower, sig) {
			return true
		}
	}
	return false
}

// reserveIPCheckin 尝试预留单 IP 今日签到额度，支持按唯一 Token 绑定的 Redis 分布式限流与内存降级
func reserveIPCheckin(clientIP string, maxCount int) (bool, func()) {
	if maxCount <= 0 {
		return true, func() {}
	}
	today := time.Now().Format("2006-01-02")
	token := fmt.Sprintf("%d-%s", time.Now().UnixNano(), common.GetUUID()[:8])

	if common.RedisEnabled && common.RDB != nil {
		ctx := context.Background()
		key := fmt.Sprintf("checkin:ip:tokens:%s:%s", today, clientIP)
		res, err := common.RDB.Eval(ctx, checkinRateLimitScript, []string{key}, maxCount, token, int64(48*3600)).Result()
		if err == nil {
			if countAllowed, ok := res.(int64); ok && countAllowed == 1 {
				// 预留成功，release 仅精准释放当前请求所属的 token，绝不影响其他并发请求
				release := func() {
					_ = common.RDB.SRem(context.Background(), key, token).Err()
				}
				return true, release
			}
			return false, func() {}
		}
		// Redis 异常时降级走内存限制
	}

	memIPCheckinMutex.Lock()
	defer memIPCheckinMutex.Unlock()
	if memIPCheckinDate != today {
		memIPCheckinDate = today
		memIPCheckinTokens = make(map[string]map[string]struct{})
	}
	if memIPCheckinTokens[clientIP] == nil {
		memIPCheckinTokens[clientIP] = make(map[string]struct{})
	}
	if len(memIPCheckinTokens[clientIP]) >= maxCount {
		return false, func() {}
	}
	memIPCheckinTokens[clientIP][token] = struct{}{}
	release := func() {
		memIPCheckinMutex.Lock()
		defer memIPCheckinMutex.Unlock()
		if tokens, ok := memIPCheckinTokens[clientIP]; ok {
			delete(tokens, token)
		}
	}
	return true, release
}

// GetCheckinStatus 获取用户签到状态和历史记录
func GetCheckinStatus(c *gin.Context) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "签到功能未启用")
		return
	}
	userId := c.GetInt("id")
	// 获取月份参数，默认为当前月份
	month := c.DefaultQuery("month", time.Now().Format("2006-01"))

	stats, err := model.GetUserCheckinStats(userId, month)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"enabled":       setting.Enabled,
			"min_quota":     setting.MinQuota,
			"max_quota":     setting.MaxQuota,
			"require_topup": setting.RequireTopUp,
			"has_topped_up": model.HasUserEverToppedUp(userId),
			"stats":         stats,
		},
	})
}

// DoCheckin 执行用户签到
func DoCheckin(c *gin.Context) {
	setting := operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		common.ApiErrorMsg(c, "签到功能未启用")
		return
	}

	// 1. 拦截自动化爬虫 / 脚本 UA（若开启）
	if setting.BlockAutomatedUA && isAutomatedUserAgent(c.Request.UserAgent()) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("blocked automated checkin attempt from IP %s with UA: %s", c.ClientIP(), c.Request.UserAgent()))
		common.ApiErrorMsg(c, "检测到自动化脚本请求，已拦截")
		return
	}

	userId := c.GetInt("id")

	// 2. 检查充值门槛（若开启）
	if setting.RequireTopUp && !model.HasUserEverToppedUp(userId) {
		common.ApiErrorMsg(c, "仅限充值或兑换过的用户参与每日签到")
		return
	}

	// 3. 检查单 IP 每日签到频控（若开启）
	allowed, release := reserveIPCheckin(c.ClientIP(), setting.MaxCheckinPerIP)
	if !allowed {
		common.ApiErrorMsg(c, "该 IP 今日签到次数已达上限")
		return
	}

	checkin, err := model.UserCheckin(userId)
	if err != nil {
		release() // 签到失败（如今日已签到过），回退 IP 计数预留
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	model.RecordLog(userId, model.LogTypeSystem, fmt.Sprintf("用户签到，获得额度 %s", logger.LogQuota(checkin.QuotaAwarded)))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "签到成功",
		"data": gin.H{
			"quota_awarded": checkin.QuotaAwarded,
			"checkin_date":  checkin.CheckinDate,
		},
	})
}
