package opencode

// ModelList 是渠道的预置模型提示。这里只放上游免费层**实际存在**的模型：
// 参考 https://opencode.ai/zen/v1/models 返回的 id（含 "free" 后缀者为免费层）。
// 注意：不要填 zen-default 之类的占位名 —— 上游没有这些模型，渠道测试会直接 401。
var ModelList = []string{
	"mimo-v2.6-flash-free",
	"deepseek-v4-flash-free",
	"mimo-v2.5-free",
	"nemotron-3.5-lightning-free",
	"longcat-2.5-preview-free",
	"ling-3.0-flash-fin-free",
	"space-bunny-free",
	"jev-1.13-free",
}

var ChannelName = "opencode"
