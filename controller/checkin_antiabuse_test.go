package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAutomatedUserAgentDetection(t *testing.T) {
	automatedUAs := []string{
		"python-requests/2.31.0",
		"Python/3.10 aiohttp/3.8.5",
		"httpx/0.24.1",
		"axios/1.6.2",
		"node-fetch/2.6.7",
		"got/11.8.5",
		"undici/5.28.0",
		"curl/8.4.0",
		"Wget/1.21.3",
		"PostmanRuntime/7.32.3",
		"Go-http-client/1.1",
		"Python-urllib/3.10",
		"Scrapy/2.11.0",
		"",
		"   ",
	}

	for _, ua := range automatedUAs {
		assert.True(t, isAutomatedUserAgent(ua), "expected automated UA detection for: %s", ua)
	}

	legitimateUAs := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36",
	}

	for _, ua := range legitimateUAs {
		assert.False(t, isAutomatedUserAgent(ua), "expected legitimate browser UA for: %s", ua)
	}
}

func TestIPCheckinRateLimiterReservation(t *testing.T) {
	previousRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	defer func() {
		common.RedisEnabled = previousRedisEnabled
	}()

	clientIP := "192.0.2.100"

	// Reset memory state for testing
	memIPCheckinMutex.Lock()
	memIPCheckinDate = time.Now().Format("2006-01-02")
	memIPCheckinCounts = make(map[string]int)
	memIPCheckinMutex.Unlock()

	// maxCount = 0 (unlimited)
	allowed, release := reserveIPCheckin(clientIP, 0)
	assert.True(t, allowed)
	release()

	// maxCount = 2
	allowed1, release1 := reserveIPCheckin(clientIP, 2)
	assert.True(t, allowed1)

	allowed2, release2 := reserveIPCheckin(clientIP, 2)
	assert.True(t, allowed2)

	// 3rd attempt exceeds limit
	allowed3, release3 := reserveIPCheckin(clientIP, 2)
	assert.False(t, allowed3)
	release3()

	// Rollback one reservation
	release2()

	// Now 3rd attempt should succeed
	allowedAgain, releaseAgain := reserveIPCheckin(clientIP, 2)
	assert.True(t, allowedAgain)
	release1()
	releaseAgain()
}

func TestIPRegisterRateLimiterReservation(t *testing.T) {
	previousRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	defer func() {
		common.RedisEnabled = previousRedisEnabled
	}()

	clientIP := "198.51.100.50"

	memIPRegisterMutex.Lock()
	memIPRegisterTimes = make(map[string][]time.Time)
	memIPRegisterMutex.Unlock()

	// maxCount = 1
	allowed1, release1 := reserveIPRegister(clientIP, 1)
	assert.True(t, allowed1)

	// 2nd attempt should be blocked
	allowed2, release2 := reserveIPRegister(clientIP, 1)
	assert.False(t, allowed2)
	release2()

	// Release 1st reservation
	release1()

	// Retry should succeed
	allowedRetry, releaseRetry := reserveIPRegister(clientIP, 1)
	assert.True(t, allowedRetry)
	releaseRetry()
}

func TestHasUserEverToppedUp(t *testing.T) {
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	previousDB := model.DB
	model.DB = db
	defer func() {
		model.DB = previousDB
	}()

	require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Redemption{}))

	userNoPay := 101
	userOnlinePay := 102
	userCodeRedeem := 103
	userPendingOnly := 104

	// userOnlinePay has a successful topup
	require.NoError(t, db.Create(&model.TopUp{
		UserId:        userOnlinePay,
		Amount:        100000,
		TradeNo:       "trade-success-1",
		PaymentMethod: "epay",
		Status:        common.TopUpStatusSuccess,
	}).Error)

	// userPendingOnly has only a pending topup
	require.NoError(t, db.Create(&model.TopUp{
		UserId:        userPendingOnly,
		Amount:        50000,
		TradeNo:       "trade-pending-1",
		PaymentMethod: "stripe",
		Status:        common.TopUpStatusPending,
	}).Error)

	// userCodeRedeem redeemed a code
	require.NoError(t, db.Create(&model.Redemption{
		Key:        "32characterkey000000000000000001",
		Name:       "VIP Card",
		Status:     common.RedemptionCodeStatusUsed,
		UsedUserId: userCodeRedeem,
	}).Error)

	assert.False(t, model.HasUserEverToppedUp(0))
	assert.False(t, model.HasUserEverToppedUp(userNoPay))
	assert.False(t, model.HasUserEverToppedUp(userPendingOnly))
	assert.True(t, model.HasUserEverToppedUp(userOnlinePay))
	assert.True(t, model.HasUserEverToppedUp(userCodeRedeem))
}

func TestDoCheckinAntiAbuseControls(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	previousRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	defer func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
	}()

	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Checkin{}, &model.TopUp{}, &model.Redemption{}, &model.Log{}))

	// Create test users
	userFree := model.User{
		Username: "free_user",
		Quota:    0,
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "aff_free_1",
	}
	require.NoError(t, db.Create(&userFree).Error)

	userPaid := model.User{
		Username: "paid_user",
		Quota:    1000,
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		AffCode:  "aff_paid_1",
	}
	require.NoError(t, db.Create(&userPaid).Error)
	require.NoError(t, db.Create(&model.TopUp{
		UserId:        userPaid.Id,
		Amount:        10000,
		TradeNo:       "trade-paid-checkin",
		Status:        common.TopUpStatusSuccess,
		PaymentMethod: "epay",
	}).Error)

	setting := operation_setting.GetCheckinSetting()
	origEnabled := setting.Enabled
	origRequireTopUp := setting.RequireTopUp
	origBlockUA := setting.BlockAutomatedUA
	origMaxIP := setting.MaxCheckinPerIP
	defer func() {
		setting.Enabled = origEnabled
		setting.RequireTopUp = origRequireTopUp
		setting.BlockAutomatedUA = origBlockUA
		setting.MaxCheckinPerIP = origMaxIP
	}()

	setting.Enabled = true
	setting.MinQuota = 500
	setting.MaxQuota = 1000

	setupRouter := func(userId int) *gin.Engine {
		r := gin.New()
		r.POST("/checkin", func(c *gin.Context) {
			c.Set("id", userId)
			DoCheckin(c)
		})
		return r
	}

	t.Run("Blocked by Automated UA", func(t *testing.T) {
		setting.BlockAutomatedUA = true
		setting.RequireTopUp = false
		setting.MaxCheckinPerIP = 0

		r := setupRouter(userPaid.Id)

		req := httptest.NewRequest(http.MethodPost, "/checkin", nil)
		req.Header.Set("User-Agent", "python-requests/2.31.0")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		var resp map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp["success"].(bool))
		assert.Contains(t, resp["message"].(string), "自动化脚本")
	})

	t.Run("Blocked by TopUp Requirement for Free User", func(t *testing.T) {
		setting.BlockAutomatedUA = false
		setting.RequireTopUp = true
		setting.MaxCheckinPerIP = 0

		r := setupRouter(userFree.Id)

		req := httptest.NewRequest(http.MethodPost, "/checkin", nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		var resp map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.False(t, resp["success"].(bool))
		assert.Contains(t, resp["message"].(string), "充值或兑换")
	})

	t.Run("Allowed for Paid User", func(t *testing.T) {
		setting.BlockAutomatedUA = false
		setting.RequireTopUp = true
		setting.MaxCheckinPerIP = 0

		r := setupRouter(userPaid.Id)

		req := httptest.NewRequest(http.MethodPost, "/checkin", nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		var resp map[string]any
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
		assert.True(t, resp["success"].(bool), fmt.Sprintf("failed response: %v", resp))
		assert.Equal(t, "签到成功", resp["message"].(string))
	})

	t.Run("Blocked by MaxCheckinPerIP limit", func(t *testing.T) {
		setting.BlockAutomatedUA = false
		setting.RequireTopUp = false
		setting.MaxCheckinPerIP = 1

		// Create another paid user to test same IP checkin
		userPaid2 := model.User{
			Username: "paid_user_2",
			Quota:    1000,
			Role:     common.RoleCommonUser,
			Status:   common.UserStatusEnabled,
			AffCode:  "aff_paid_2",
		}
		require.NoError(t, db.Create(&userPaid2).Error)

		// Reset memory IP counter
		memIPCheckinMutex.Lock()
		memIPCheckinDate = time.Now().Format("2006-01-02")
		memIPCheckinCounts = make(map[string]int)
		memIPCheckinMutex.Unlock()

		ip := "192.168.1.88:1234"

		// 1st user from IP checks in -> should succeed
		r1 := setupRouter(userPaid2.Id)
		req1 := httptest.NewRequest(http.MethodPost, "/checkin", nil)
		req1.RemoteAddr = ip
		req1.Header.Set("User-Agent", "Mozilla/5.0")
		w1 := httptest.NewRecorder()
		r1.ServeHTTP(w1, req1)

		var resp1 map[string]any
		require.NoError(t, json.Unmarshal(w1.Body.Bytes(), &resp1))
		assert.True(t, resp1["success"].(bool))

		// 2nd user from same IP checks in -> should be blocked by IP limit
		userPaid3 := model.User{
			Username: "paid_user_3",
			Quota:    1000,
			Role:     common.RoleCommonUser,
			Status:   common.UserStatusEnabled,
			AffCode:  "aff_paid_3",
		}
		require.NoError(t, db.Create(&userPaid3).Error)

		r2 := setupRouter(userPaid3.Id)
		req2 := httptest.NewRequest(http.MethodPost, "/checkin", nil)
		req2.RemoteAddr = ip
		req2.Header.Set("User-Agent", "Mozilla/5.0")
		w2 := httptest.NewRecorder()
		r2.ServeHTTP(w2, req2)

		var resp2 map[string]any
		require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp2))
		assert.False(t, resp2["success"].(bool))
		assert.Contains(t, resp2["message"].(string), "IP 今日签到次数已达上限")
	})
}

func TestRegisterRateLimitPerIP(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	previousDB := model.DB
	model.DB = db
	previousRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	defer func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedisEnabled
	}()

	require.NoError(t, i18n.Init())
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))

	prevMaxReg := common.MaxRegisterNumPerIP
	defer func() {
		common.MaxRegisterNumPerIP = prevMaxReg
	}()

	common.MaxRegisterNumPerIP = 1
	clientIP := "10.0.0.1:4321"

	memIPRegisterMutex.Lock()
	memIPRegisterTimes = make(map[string][]time.Time)
	memIPRegisterMutex.Unlock()

	r := gin.New()
	r.POST("/register", Register)

	// 1st register from IP -> succeeds
	body1, _ := json.Marshal(map[string]string{
		"username": "farm_account_1",
		"password": "Password123!",
	})
	req1 := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body1))
	req1.RemoteAddr = clientIP
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)

	var resp1 map[string]any
	require.NoError(t, json.Unmarshal(w1.Body.Bytes(), &resp1))
	assert.True(t, resp1["success"].(bool))

	// 2nd register from same IP -> blocked by IP limit
	body2, _ := json.Marshal(map[string]string{
		"username": "farm_account_2",
		"password": "Password123!",
	})
	req2 := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body2))
	req2.RemoteAddr = clientIP
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Accept-Language", "zh-CN")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	var resp2 map[string]any
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp2))
	assert.False(t, resp2["success"].(bool))
	assert.Contains(t, resp2["message"].(string), "注册账号数量已达上限")

	// 3rd: Simulate timestamp 25 hours ago (rolling window expiration)
	memIPRegisterMutex.Lock()
	memIPRegisterTimes["10.0.0.1"] = []time.Time{time.Now().Add(-25 * time.Hour)}
	memIPRegisterMutex.Unlock()

	body3, _ := json.Marshal(map[string]string{
		"username": "farm_account_3",
		"password": "Password123!",
	})
	req3 := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body3))
	req3.RemoteAddr = clientIP
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)

	var resp3 map[string]any
	require.NoError(t, json.Unmarshal(w3.Body.Bytes(), &resp3))
	assert.True(t, resp3["success"].(bool), "Should succeed because previous registration was >24 hours ago")
}
