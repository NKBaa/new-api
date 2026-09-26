package opencode

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
)

// OpenCode 上游按客户端指纹拦截请求：缺少会话标识时返回 400 MissingSessionID，
// 非官方客户端会被 403 Forbidden 或 429 FreeUsageLimitError 拒绝，免费额度还会以
// 403 FreeTierError("can only be used from within OpenCode") 拒绝。
//
// 闸门校验的是**指纹形状**而不只是有没有这些头，因此以下三者必须同时正确：
//   - User-Agent 的 opencode/<major>.<minor> 版本号不低于 1.17；
//   - x-opencode-session / x-opencode-request 是官方格式的客户端 ID（并非 UUID）；
//   - 请求体为流式且声明 bash / read 工具（见本文件末尾说明，当前**未**实现）。
const (
	// officialUserAgent 覆盖普通客户端的 UA。
	officialUserAgent = "opencode/1.18.31"
	// userAgentPrefix 命中且版本足够时才认为请求来自官方 CLI。
	userAgentPrefix = "opencode/"
	// officialUAMinMinor 是上游闸门接受的最低 1.x 客户端次版本号。
	officialUAMinMinor = 17
	// clientName 标记请求来源为 CLI。
	clientName = "cli"
)

// 官方客户端 ID 的形状：<prefix>_ + 12 位十六进制时间戳字段 + 14 位随机 base62。
// 上游按此形状校验，UUID 会被判定为非官方客户端。
const (
	idRandomLength   = 14
	idTimeHexLength  = 12
	idBase62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	sessionIDPrefix  = "ses"
	requestIDPrefix  = "msg"
)

// sessionHeaderCandidates 依次尝试继承客户端已有的会话标识。
var sessionHeaderCandidates = []string{"x-opencode-session", "x-session-id", "session-id"}

// idState 让同一毫秒内的多个 ID 共享自增计数，与官方生成器一致。
var (
	idStateMu       sync.Mutex
	idLastTimestamp int64
	idCounter       uint64
)

// hasUsableOfficialUA 判断 UA 是否来自版本足够新的官方客户端。版本过旧（例如
// opencode/1.3.15）同样会被闸门拒绝，必须一并覆盖掉。
func hasUsableOfficialUA(ua string) bool {
	rest, ok := strings.CutPrefix(strings.ToLower(ua), userAgentPrefix)
	if !ok {
		return false
	}
	majorPart, rest, _ := strings.Cut(rest, ".")
	major, err := strconv.Atoi(majorPart)
	if err != nil {
		return false
	}
	if major != 1 {
		return major > 1
	}
	minorPart, _, _ := strings.Cut(rest, ".")
	minor, err := strconv.Atoi(minorPart)
	if err != nil {
		return false
	}
	return minor >= officialUAMinMinor
}

// isOpenCodeClientID 校验官方客户端 ID 形状（大小写敏感的 base62 随机段）。
func isOpenCodeClientID(id, prefix string) bool {
	if len(id) != len(prefix)+1+idTimeHexLength+idRandomLength {
		return false
	}
	rest, ok := strings.CutPrefix(id, prefix+"_")
	if !ok {
		return false
	}
	for _, r := range rest[:idTimeHexLength] {
		if !strings.ContainsRune("0123456789abcdef", r) {
			return false
		}
	}
	for _, r := range rest[idTimeHexLength:] {
		if !strings.ContainsRune(idBase62Alphabet, r) {
			return false
		}
	}
	return true
}

// newClientID 生成官方形状的客户端 ID。descending 用于 ses_（官方对会话 ID 取反），
// 其余（msg_）为 ascending。
func newClientID(prefix string, descending bool) string {
	now := time.Now().UnixMilli()

	idStateMu.Lock()
	if now != idLastTimestamp {
		idLastTimestamp = now
		idCounter = 0
	}
	idCounter++
	counter := idCounter
	idStateMu.Unlock()

	const timeMask = 1<<48 - 1
	value := (uint64(now)*0x1000 + counter) & timeMask
	if descending {
		value = ^value & timeMask
	}

	raw := make([]byte, idRandomLength)
	// crypto/rand.Read 在受支持的平台上不会失败。
	_, _ = rand.Read(raw)
	random := make([]byte, idRandomLength)
	for i, b := range raw {
		random[i] = idBase62Alphabet[int(b)%len(idBase62Alphabet)]
	}

	return fmt.Sprintf("%s_%0*x%s", prefix, idTimeHexLength, value, random)
}

// SetupOpenCodeHeaders 组装官方客户端指纹（header 会被就地补齐）。
//
// 转发路径与「获取模型列表」探测共用此函数，保证两处指纹一致。header_override 的
// 最高优先级不在此处理：转发链路由 channel.DoApiRequest 在 SetupRequestHeader
// **之后**统一套用（见 relay/channel/api_request.go），模型拉取链路由
// applyFetchModelsHeaderOverrides 在调用方之后套用，两处都天然高于此处设置的值。
//
// c 允许为 nil（后台拉取模型时无请求上下文），此时使用默认指纹。
//
// ⚠️ 已知不完整：上游免费额度闸门还会要求请求体 `stream: true` 且声明 opencode 的
// 内置 `bash` / `read` 工具。本函数只处理请求头，因此在仅靠请求头不足以放行的
// 上游策略下仍可能收到 403 FreeTierError。
func SetupOpenCodeHeaders(header *http.Header, c *gin.Context) {
	if header == nil {
		return
	}

	// UA：仅当来自版本足够新的官方 CLI 时透传，否则统一伪装。
	clientUA := ""
	if c != nil && c.Request != nil {
		clientUA = strings.TrimSpace(c.Request.Header.Get("User-Agent"))
	}
	if !hasUsableOfficialUA(clientUA) {
		clientUA = officialUserAgent
	}
	header.Set("User-Agent", clientUA)

	// 客户端标识：仅在未显式传入时补齐。
	if header.Get("x-opencode-client") == "" {
		header.Set("x-opencode-client", clientName)
	}

	// 会话标识：只继承形状合法的官方 ID，否则生成新 ID，防止 400 MissingSessionID。
	if header.Get("x-opencode-session") == "" {
		sessionID := ""
		if c != nil && c.Request != nil {
			for _, name := range sessionHeaderCandidates {
				if v := strings.TrimSpace(c.Request.Header.Get(name)); isOpenCodeClientID(v, sessionIDPrefix) {
					sessionID = v
					break
				}
			}
		}
		if sessionID == "" {
			sessionID = newClientID(sessionIDPrefix, true)
		}
		header.Set("x-opencode-session", sessionID)
	}

	// 每次请求独立的唯一标识。
	header.Set("x-opencode-request", newClientID(requestIDPrefix, false))
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
