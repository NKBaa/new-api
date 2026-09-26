package opencode

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/google/uuid"

	"github.com/gin-gonic/gin"
)

// OpenCode 上游按客户端指纹拦截请求：缺少会话标识时返回 400 MissingSessionID，
// 非官方客户端会被 403 Forbidden 或 429 FreeUsageLimitError 拒绝。因此转发前必须
// 补齐官方 CLI 的请求头。
const (
	// officialUserAgent 覆盖普通客户端的 UA。
	officialUserAgent = "opencode/1.3.15/cli"
	// userAgentPrefix 命中时说明请求来自官方 CLI 本身，原样透传其 UA。
	userAgentPrefix = "opencode/"
	// clientName 标记请求来源为 CLI。
	clientName = "cli"
)

// sessionHeaderCandidates 依次尝试继承客户端已有的会话标识，避免上游报
// 400 MissingSessionID。
var sessionHeaderCandidates = []string{"x-opencode-session", "x-session-id", "session-id"}

// SetupOpenCodeHeaders 组装官方客户端指纹(request, header 会被就地补齐)。
//
// 转发路径与「获取模型列表」探测共用此函数，保证两处指纹一致。header_override 的
// 最高优先级不在此处理：转发链路由 channel.DoApiRequest 在 SetupRequestHeader
// **之后**统一套用（见 relay/channel/api_request.go），模型拉取链路由
// applyFetchModelsHeaderOverrides 在调用方之后套用，两处都天然高于此处设置的值。
//
// c 允许为 nil（后台拉取模型时无请求上下文），此时使用默认指纹。
func SetupOpenCodeHeaders(header *http.Header, c *gin.Context) {
	if header == nil {
		return
	}

	// UA：官方 CLI 原样透传，其余客户端统一伪装成官方 CLI。
	clientUA := ""
	if c != nil && c.Request != nil {
		clientUA = strings.TrimSpace(c.Request.Header.Get("User-Agent"))
	}
	if !strings.HasPrefix(strings.ToLower(clientUA), userAgentPrefix) {
		clientUA = officialUserAgent
	}
	header.Set("User-Agent", clientUA)

	// 客户端标识：仅在未显式传入时补齐。
	if header.Get("x-opencode-client") == "" {
		header.Set("x-opencode-client", clientName)
	}

	// 会话标识：优先继承客户端传入的值，缺失则生成 UUID，防止 400 MissingSessionID。
	if header.Get("x-opencode-session") == "" {
		sessionID := ""
		if c != nil && c.Request != nil {
			for _, name := range sessionHeaderCandidates {
				if v := strings.TrimSpace(c.Request.Header.Get(name)); v != "" {
					sessionID = v
					break
				}
			}
		}
		if sessionID == "" {
			sessionID = uuid.New().String()
		}
		header.Set("x-opencode-session", sessionID)
	}

	// 每次请求独立的唯一标识。
	header.Set("x-opencode-request", uuid.New().String())
}

// Adaptor 复用 OpenAI 协议实现，仅覆写请求头组装以注入官方客户端指纹。
type Adaptor struct {
	openai.Adaptor
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	if err := a.Adaptor.SetupRequestHeader(c, req, info); err != nil {
		return err
	}
	SetupOpenCodeHeaders(req, c)
	return nil
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
