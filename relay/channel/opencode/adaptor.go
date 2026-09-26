package opencode

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/samber/lo"

	"github.com/gin-gonic/gin"
)

// OpenCode Zen 免费额度闸门（403 FreeTierError）同时校验**请求头指纹**与
// **请求体形状**，两者缺一不可：
//
//   - 请求头：User-Agent 为版本足够新的官方 CLI、x-opencode-session /
//     x-opencode-request 是官方格式的客户端 ID。
//   - 请求体：`stream: true`，且声明 opencode 内置的 agent 工具
//     （bash / edit / glob / grep / read）。上游对「非 agent 形状」的免费请求
//     在所有通道上返回 403 FreeTierError。
//
// 由于上游不会告知某个模型是否免费，本渠道对**所有**请求统一整形；整形后若客户端
// 原本要求非流式，则由本包把 SSE 聚合成单个 JSON 响应再交给 OpenAI 处理器，
// 客户端无需感知。
//
// 参考实现（Go）：https://github.com/jasonxu114514/opencode2api
const (
	// officialUserAgent 覆盖普通客户端的 UA。
	officialUserAgent = "opencode/1.18.31"
	// userAgentPrefix 命中且版本足够时才认为请求来自官方 CLI。
	userAgentPrefix = "opencode/"
	// officialUAMinMinor 是上游闸门接受的最低 1.x 客户端次版本号。
	officialUAMinMinor = 17
	// clientName 标记请求来源为 CLI。
	clientName = "cli"

	// contextKeyCollapseStream 标记「上游被强制流式，但客户端要的是非流式」，
	// 需要在 DoResponse 阶段把 SSE 聚合回 JSON。
	contextKeyCollapseStream = "opencode_collapse_stream"

	// contextKeySessionIdentity 存放 ConvertOpenAIRequest 阶段派生好的会话标识。
	// 该阶段早于 SetupRequestHeader，因此可以把请求体里的稳定信号（会话 ID、
	// 首条用户消息）一并纳入指纹。
	contextKeySessionIdentity = "opencode_session_identity"

	// contextKeyAgentShaped 标记请求体已按 agent 形状整形，避免 DoRequest 兜底时重复处理。
	contextKeyAgentShaped = "opencode_agent_shaped"

	// defaultProjectSignal 在客户端未提供工程信号时使用。
	defaultProjectSignal = "newapi:default-project"

	// agentToolDescription 对齐官方形态（"Agent tool <name>"）。刻意不用长句
	// 负面约束 —— 那种文案既有明显人工伪造特征，也可能干扰小模型推理。
	agentToolDescriptionPrefix = "Agent tool "

	// projectIDPrefix 是 x-opencode-project 的前缀，后接 24 位十六进制。
	projectIDPrefix = "prj"
)

// sessionIdentity 是一次请求派生出的稳定标识集合。
type sessionIdentity struct {
	Session       string
	Project       string
	ParentSession string
}

// officialAgentTools 是上游认定的 agent 形状所要求的工具名。
var officialAgentTools = []string{"bash", "edit", "glob", "grep", "read"}

// 官方客户端 ID 的形状：<prefix>_ + 12 位十六进制时间戳字段 + 14 位随机 base62。
// 上游按此形状校验，UUID 会被判定为非官方客户端。
const (
	idRandomLength   = 14
	idTimeHexLength  = 12
	idBase62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	sessionIDPrefix  = "ses"
	requestIDPrefix  = "msg"
)

// sessionHeaderCandidates 依次尝试继承客户端已有的会话标识。除官方头外还包含
// 1.18.x 使用的关联别名与通用会话头，以便外部客户端也能保住上游缓存亲和性。
var sessionHeaderCandidates = []string{
	"x-opencode-session",
	"x-session-affinity",
	"X-Session-Id",
	"x-session-id",
	"session-id",
	"conversation-id",
}

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

// isOpenCodeClientID 校验官方客户端 ID 形状（base62 随机段大小写敏感）。
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

// canonicalSessionID 把任意下行信号规范化为官方会话 ID 形状。已经是官方形状的
// 原样保留（保住上游 prompt 缓存亲和性）；其余（UUID、外部客户端会话、网关会话、
// 会话种子）确定性哈希，使同一会话在多轮之间保持同一个 ID。
func canonicalSessionID(signal string) string {
	if isOpenCodeClientID(signal, sessionIDPrefix) {
		return signal
	}
	sum := sha256.Sum256([]byte(sessionIDPrefix + "\x00" + signal))
	random := make([]byte, idRandomLength)
	for i := range idRandomLength {
		random[i] = idBase62Alphabet[int(sum[6+i])%len(idBase62Alphabet)]
	}
	return fmt.Sprintf("%s_%x%s", sessionIDPrefix, sum[:6], random)
}

// newClientID 生成官方形状的客户端 ID。descending 用于 ses_（官方对会话 ID 取反），
// msg_ 为 ascending。
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
// c 允许为 nil（后台拉取模型时无请求上下文），此时使用默认指纹。请求体整形见
// applyAgentShape（由 ConvertOpenAIRequest 调用）。
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
	// 声明客户端原生支持流式事件（官方 CLI 必带）。
	header.Set("Accept", "application/json, text/event-stream")

	// 客户端标识：仅在未显式传入时补齐。
	if header.Get("x-opencode-client") == "" {
		header.Set("x-opencode-client", clientName)
	}

	// 会话标识：优先使用请求体阶段派生好的稳定标识（能纳入 body 信号），
	// 否则从客户端头继承合法形状的官方 ID，都没有才生成新 ID。
	sessionID := header.Get("x-opencode-session")
	if sessionID == "" {
		sessionID = deriveSessionID(c)
		header.Set("x-opencode-session", sessionID)
	}

	// OpenCode 1.18.x 会同时发送这些关联头以维持上游的 prompt/session 亲和性；
	// 保留 x-opencode-session 是为了让较早的 Zen 部署仍能识别请求。
	header.Set("x-session-affinity", sessionID)
	header.Set("X-Session-Id", sessionID)

	// 每次请求独立的唯一标识。
	header.Set("x-opencode-request", newClientID(requestIDPrefix, false))

	// 工程标识：同一会话保持稳定，符合官方形状 prj_ + 24 位十六进制。
	if header.Get("x-opencode-project") == "" {
		project := projectIDForSignal(sessionID)
		if identity, ok := sessionIdentityFromContext(c); ok && identity.Project != "" {
			project = identity.Project
		}
		header.Set("x-opencode-project", project)
	}

	// 父会话透传：仅在客户端提供时发送。
	if header.Get("x-parent-session-id") == "" {
		if identity, ok := sessionIdentityFromContext(c); ok && identity.ParentSession != "" {
			header.Set("x-parent-session-id", identity.ParentSession)
		}
	}
}

// deriveSessionID 依次尝试：请求体阶段派生的稳定标识 → 客户端头 → 新生成 ID。
func deriveSessionID(c *gin.Context) string {
	if identity, ok := sessionIdentityFromContext(c); ok && identity.Session != "" {
		return identity.Session
	}
	if c != nil && c.Request != nil {
		for _, name := range sessionHeaderCandidates {
			v := strings.TrimSpace(c.Request.Header.Get(name))
			if v == "" {
				continue
			}
			if isOpenCodeClientID(v, sessionIDPrefix) {
				return v
			}
			// 非官方形状的下行信号（UUID、外部会话）也确定性规范化，而不是丢弃，
			// 否则多轮对话会每轮换一个会话、丢掉上游缓存亲和性。
			return canonicalSessionID(v)
		}
	}
	return newClientID(sessionIDPrefix, true)
}

// sessionIdentityFromContext 读取 ConvertOpenAIRequest 阶段派生的标识。
func sessionIdentityFromContext(c *gin.Context) (sessionIdentity, bool) {
	if c == nil {
		return sessionIdentity{}, false
	}
	value, exists := c.Get(contextKeySessionIdentity)
	if !exists {
		return sessionIdentity{}, false
	}
	identity, ok := value.(sessionIdentity)
	return identity, ok
}

// projectIDForSignal 把工程信号确定性映射为官方形状的工程标识
// （prj_ + 24 位十六进制）。同一会话始终得到同一个值。
func projectIDForSignal(signal string) string {
	sum := sha256.Sum256([]byte(projectIDPrefix + "\x00" + signal))
	return fmt.Sprintf("%s_%x", projectIDPrefix, sum[:12])
}

// ensureAgentTools 补齐上游要求的 agent 工具，已声明的同名工具保持不变。
func ensureAgentTools(req *dto.GeneralOpenAIRequest) {
	present := make(map[string]bool, len(req.Tools))
	for _, tool := range req.Tools {
		if name := strings.TrimSpace(tool.Function.Name); name != "" {
			present[name] = true
		}
	}
	for _, name := range officialAgentTools {
		if present[name] {
			continue
		}
		req.Tools = append(req.Tools, dto.ToolCallRequest{
			Type: "function",
			Function: dto.FunctionRequest{
				Name:        name,
				Description: agentToolDescriptionPrefix + name,
				Parameters: map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			},
		})
	}
}

// applyAgentShape 把请求整形为上游要求的 agent 形状。客户端原本要求非流式时记录
// 标记，交由 DoResponse 聚合回 JSON。
func applyAgentShape(c *gin.Context, req *dto.GeneralOpenAIRequest) {
	ensureAgentTools(req)
	if c != nil {
		common.SetContextKey(c, contextKeyAgentShaped, true)
	}
	if lo.FromPtrOr(req.Stream, false) {
		return
	}
	req.Stream = lo.ToPtr(true)
	if req.StreamOptions == nil {
		req.StreamOptions = &dto.StreamOptions{IncludeUsage: true}
	}
	if c != nil {
		common.SetContextKey(c, contextKeyCollapseStream, true)
	}
}

// Adaptor 复用 OpenAI 协议实现，仅覆写指纹注入与请求体整形。
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

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	converted, err := a.Adaptor.ConvertOpenAIRequest(c, info, request)
	if err != nil {
		return nil, err
	}
	shaped, ok := converted.(*dto.GeneralOpenAIRequest)
	if !ok || shaped == nil {
		return converted, nil
	}
	applyAgentShape(c, shaped)
	deriveSessionIdentity(c, shaped)
	return shaped, nil
}

// DoRequest 必须显式覆写。
//
// openai.Adaptor.DoRequest 内部调用 channel.DoApiRequest(a, ...)，其中 a 是**静态
// 接收者类型** —— 若直接复用内嵌实现，传下去的是 *openai.Adaptor，于是
// SetupRequestHeader 分发到 openai 的实现，本包的 SetupOpenCodeHeaders 被彻底旁路，
// 上游只会看到 Go-http-client/1.1 且没有任何 x-opencode-* 头，必然 403。
//
// 同时这里承担透传模式的兜底整形：PassThroughBodyEnabled / 全局透传会绕过
// ConvertOpenAIRequest，导致 agent 形状缺失。此时在发送前对请求体做安全修饰。
func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	safeBody, err := shapePassthroughBody(c, info, requestBody)
	if err != nil {
		return nil, err
	}
	return channel.DoApiRequest(a, c, info, safeBody)
}

// shapePassthroughBody 处理绕过 ConvertOpenAIRequest 的透传请求体。仅在 chat
// completions 且请求体是 JSON 对象时整形；其余模式（embedding / 图片 / 音频 /
// realtime 等）原样返回，避免对非 chat 协议做无意义的改写。
func shapePassthroughBody(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (io.Reader, error) {
	if info == nil || info.RelayMode != relayconstant.RelayModeChatCompletions {
		return requestBody, nil
	}
	// 已经过 ConvertOpenAIRequest 时形状已就绪，无需重复处理。
	if c != nil && common.GetContextKeyBool(c, contextKeyAgentShaped) {
		return requestBody, nil
	}
	if requestBody == nil {
		return requestBody, nil
	}

	raw, err := io.ReadAll(requestBody)
	if err != nil {
		return nil, err
	}
	var req dto.GeneralOpenAIRequest
	if err := common.Unmarshal(raw, &req); err != nil {
		// 非 JSON 对象（或干脆不是 OpenAI chat 体）→ 原样透传，不破坏其它用法。
		return bytes.NewReader(raw), nil
	}

	applyAgentShape(c, &req)
	deriveSessionIdentity(c, &req)

	shaped, err := common.Marshal(&req)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(shaped), nil
}

// deriveSessionIdentity 在请求体仍可读的阶段派生会话/工程标识。此处能取到
// 请求体里的稳定信号（显式会话 ID、首条用户消息），比只看请求头更容易让同一
// 会话在多轮之间复用同一个上游会话，从而保住 prompt 缓存亲和性。
func deriveSessionIdentity(c *gin.Context, req *dto.GeneralOpenAIRequest) {
	if c == nil || req == nil {
		return
	}
	signal := firstSessionSignal(c, req)
	if signal == "" {
		signal = conversationSeed(req)
	}
	if signal == "" {
		// 没有稳定信号时仍生成一个合规会话；请求头阶段会复用该值。
		signal = newClientID(sessionIDPrefix, true)
	}

	projectSignal := strings.TrimSpace(c.Request.Header.Get("x-opencode-project"))
	if projectSignal == "" {
		projectSignal = defaultProjectSignal
	}
	parentSession := strings.TrimSpace(c.Request.Header.Get("x-parent-session-id"))

	c.Set(contextKeySessionIdentity, sessionIdentity{
		Session:       canonicalSessionID(signal),
		Project:       projectIDForSignal(projectSignal),
		ParentSession: parentSession,
	})
}

// firstSessionSignal 依次尝试客户端显式提供的会话信号。
func firstSessionSignal(c *gin.Context, req *dto.GeneralOpenAIRequest) string {
	if c != nil && c.Request != nil {
		for _, name := range sessionHeaderCandidates {
			if v := strings.TrimSpace(c.Request.Header.Get(name)); v != "" {
				return v
			}
		}
	}
	return ""
}

// conversationSeed 用首条用户消息作为会话信号：多轮对话历史增长时它的开头不变，
// 因此同一会话保持稳定，而开场不同的会话会被区分开。
func conversationSeed(req *dto.GeneralOpenAIRequest) string {
	for _, msg := range req.Messages {
		if !strings.EqualFold(strings.TrimSpace(msg.Role), "user") {
			continue
		}
		switch content := msg.Content.(type) {
		case string:
			if content != "" {
				return content
			}
		default:
			if encoded, err := common.Marshal(content); err == nil && len(encoded) > 0 && string(encoded) != "null" {
				return string(encoded)
			}
		}
	}
	return ""
}

// DoResponse 在「上游被强制流式而客户端要求非流式」时，先把 SSE 聚合成单个
// JSON 文档再交给 OpenAI 处理器；其余情况保持原样透传。
func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	if c == nil || resp == nil || !common.GetContextKeyBool(c, contextKeyCollapseStream) {
		return a.Adaptor.DoResponse(c, resp, info)
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		// 上游没有真的流式（部分网关会忽略 stream），无需聚合。
		return a.Adaptor.DoResponse(c, resp, info)
	}

	aggregated, err := collapseChatCompletionsStream(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	_ = resp.Body.Close()
	resp.Body = io.NopCloser(bytes.NewReader(aggregated))
	resp.ContentLength = int64(len(aggregated))
	resp.Header.Del("Content-Encoding")
	resp.Header.Del("Content-Length")
	resp.Header.Set("Content-Type", "application/json")
	// 让下游按非流式处理（补齐 usage、伪 200 检测、协议转换等复用官方实现）。
	info.IsStream = false

	return a.Adaptor.DoResponse(c, resp, info)
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}

// collapseChatCompletionsStream 把 Chat Completions 的 SSE 事件流聚合为等价的
// 非流式响应体。usage 以最后一个非空上报为准（由 stream_options.include_usage
// 保证出现在末尾）。
func collapseChatCompletionsStream(body io.Reader) ([]byte, error) {
	scanner := helper.NewStreamScanner(body)

	var (
		id, model          string
		created            any
		content, reasoning strings.Builder
		finishReason       string
		usage              *dto.Usage
		toolCalls          []dto.ToolCallResponse
	)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		payload, ok := strings.CutPrefix(line, "data:")
		if !ok {
			continue
		}
		payload = strings.TrimSpace(payload)
		if payload == "" || payload == "[DONE]" {
			continue
		}

		var chunk dto.ChatCompletionsStreamResponse
		if err := common.UnmarshalJsonStr(payload, &chunk); err != nil {
			// 忽略注释/心跳等非 JSON 帧。
			continue
		}
		if chunk.Id != "" {
			id = chunk.Id
		}
		if chunk.Model != "" {
			model = chunk.Model
		}
		if chunk.Created != 0 {
			created = chunk.Created
		}
		if chunk.Usage != nil && (chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 || chunk.Usage.TotalTokens > 0) {
			usage = chunk.Usage
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != nil {
				content.WriteString(*choice.Delta.Content)
			}
			reasoning.WriteString(choice.Delta.GetReasoningContent())
			for _, call := range choice.Delta.ToolCalls {
				mergeStreamToolCall(&toolCalls, call)
			}
			if choice.FinishReason != nil && *choice.FinishReason != "" {
				finishReason = *choice.FinishReason
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	message := dto.Message{Role: "assistant", Content: content.String()}
	if reasoning.Len() > 0 {
		reasoningText := reasoning.String()
		message.ReasoningContent = &reasoningText
	}
	if len(toolCalls) > 0 {
		merged := make([]dto.ToolCallResponse, len(toolCalls))
		for i, call := range toolCalls {
			// index 只存在于流式分片，非流式响应不带该字段。
			call.Index = nil
			if call.Type == nil {
				call.Type = "function"
			}
			merged[i] = call
		}
		raw, err := common.Marshal(merged)
		if err != nil {
			return nil, err
		}
		message.ToolCalls = raw
	}

	result := dto.OpenAITextResponse{
		Id:      id,
		Model:   model,
		Object:  "chat.completion",
		Created: created,
		Choices: []dto.OpenAITextResponseChoice{{
			Index:        0,
			Message:      message,
			FinishReason: finishReason,
		}},
	}
	if usage != nil {
		result.Usage = *usage
	}
	return common.Marshal(result)
}

// mergeStreamToolCall 按 index 合并流式工具调用分片（参数按增量拼接）。
func mergeStreamToolCall(calls *[]dto.ToolCallResponse, delta dto.ToolCallResponse) {
	index := len(*calls)
	if delta.Index != nil {
		index = *delta.Index
	}
	for len(*calls) <= index {
		*calls = append(*calls, dto.ToolCallResponse{})
	}
	target := &(*calls)[index]
	if delta.ID != "" {
		target.ID = delta.ID
	}
	if delta.Type != nil {
		target.Type = delta.Type
	}
	if delta.Function.Name != "" {
		target.Function.Name = delta.Function.Name
	}
	target.Function.Arguments += delta.Function.Arguments
}
