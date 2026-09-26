package opencode

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
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

	// agentToolDescription 劝阻模型真的调用这些占位工具。
	agentToolDescription = "Unavailable in this client. Never call this tool; use the other tools instead."
)

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
				Description: agentToolDescription,
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
	} // 上游形状整形只作用于本渠道的 chat 请求体。透传模式（PassThroughBodyEnabled）
	// 不经过本函数，此时仅保留请求头伪装。
	shaped, ok := converted.(*dto.GeneralOpenAIRequest)
	if !ok || shaped == nil {
		return converted, nil
	}
	applyAgentShape(c, shaped)
	return shaped, nil
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
