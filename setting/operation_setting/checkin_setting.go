package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// CheckinSetting 签到功能配置
type CheckinSetting struct {
	Enabled          bool `json:"enabled"`             // 是否启用签到功能
	MinQuota         int  `json:"min_quota"`           // 签到最小额度奖励
	MaxQuota         int  `json:"max_quota"`           // 签到最大额度奖励
	RequireTopUp     bool `json:"require_topup"`       // 是否仅允许充值或兑换过卡密的用户参与签到
	MaxCheckinPerIP  int  `json:"max_checkin_per_ip"`  // 单 IP 每日最多签到次数，0 为不限制
	BlockAutomatedUA bool `json:"block_automated_ua"`   // 是否拦截常见自动化脚本 User-Agent
}

// 默认配置
var checkinSetting = CheckinSetting{
	Enabled:          false, // 默认关闭
	MinQuota:         1000,  // 默认最小额度 1000 (约 0.002 USD)
	MaxQuota:         10000, // 默认最大额度 10000 (约 0.02 USD)
	RequireTopUp:     false, // 默认不限制充值门槛
	MaxCheckinPerIP:  0,     // 默认不限制单 IP 每日签到次数
	BlockAutomatedUA: false, // 默认不强制拦截自动化脚本 UA
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("checkin_setting", &checkinSetting)
}

// GetCheckinSetting 获取签到配置
func GetCheckinSetting() *CheckinSetting {
	return &checkinSetting
}

// IsCheckinEnabled 是否启用签到功能
func IsCheckinEnabled() bool {
	return checkinSetting.Enabled
}

// GetCheckinQuotaRange 获取签到额度范围
func GetCheckinQuotaRange() (min, max int) {
	return checkinSetting.MinQuota, checkinSetting.MaxQuota
}
