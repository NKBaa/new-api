package opencode

import (
	"bytes"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- 请求体整形（上游免费额度闸门要求 agent 形状）---

func TestApplyAgentShapeForcesStreamAndRecordsCollapse(t *testing.T) {
	c := testContext(nil)
	req := &dto.GeneralOpenAIRequest{Model: "deepseek-v4-flash"}

	applyAgentShape(c, req)

	assert.True(t, lo.FromPtrOr(req.Stream, false), "free-tier gating requires stream:true upstream")
	assert.True(t, common.GetContextKeyBool(c, contextKeyCollapseStream),
		"a non-streaming client must be flagged so the SSE is collapsed back to JSON")
	require.NotNil(t, req.StreamOptions)
	assert.True(t, req.StreamOptions.IncludeUsage, "usage must survive the forced stream")
}

func TestApplyAgentShapeLeavesStreamingClientUntouched(t *testing.T) {
	c := testContext(nil)
	req := &dto.GeneralOpenAIRequest{Model: "m", Stream: lo.ToPtr(true)}

	applyAgentShape(c, req)

	assert.True(t, lo.FromPtrOr(req.Stream, false))
	assert.False(t, common.GetContextKeyBool(c, contextKeyCollapseStream),
		"a streaming client already gets SSE, so no collapse is needed")
	assert.Nil(t, req.StreamOptions, "an existing streaming client keeps its own stream_options")
}

func TestApplyAgentShapeKeepsExistingStreamOptions(t *testing.T) {
	c := testContext(nil)
	req := &dto.GeneralOpenAIRequest{
		Model:         "m",
		StreamOptions: &dto.StreamOptions{IncludeUsage: false},
	}

	applyAgentShape(c, req)

	require.NotNil(t, req.StreamOptions)
	assert.False(t, req.StreamOptions.IncludeUsage, "an explicit client choice must not be overwritten")
}

func TestEnsureAgentToolsInjectsAllRequiredTools(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{Model: "m"}

	ensureAgentTools(req)

	names := make(map[string]bool, len(req.Tools))
	for _, tool := range req.Tools {
		names[tool.Function.Name] = true
	}
	for _, want := range officialAgentTools {
		assert.True(t, names[want], "missing injected tool %q", want)
	}
	assert.Len(t, req.Tools, len(officialAgentTools))
}

func TestEnsureAgentToolsUsesOfficialDescriptionShape(t *testing.T) {
	// 对齐 opencode2api 的 "Agent tool <name>"。长句负面约束既有明显伪造特征，
	// 也可能干扰小模型推理，因此必须保持这一形态。
	req := &dto.GeneralOpenAIRequest{Model: "m"}
	ensureAgentTools(req)

	require.NotEmpty(t, req.Tools)
	for _, tool := range req.Tools {
		assert.Equal(t, "Agent tool "+tool.Function.Name, tool.Function.Description)
	}
}

func TestEnsureAgentToolsPreservesClientToolsAndDoesNotDuplicate(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{
		Model: "m",
		Tools: []dto.ToolCallRequest{
			{Type: "function", Function: dto.FunctionRequest{Name: "bash", Description: "client bash"}},
			{Type: "function", Function: dto.FunctionRequest{Name: "my_tool"}},
		},
	}

	ensureAgentTools(req)

	var bashCount int
	var sawClientBash, sawMyTool bool
	for _, tool := range req.Tools {
		switch tool.Function.Name {
		case "bash":
			bashCount++
			if tool.Function.Description == "client bash" {
				sawClientBash = true
			}
		case "my_tool":
			sawMyTool = true
		}
	}
	assert.Equal(t, 1, bashCount, "a client-declared bash must not be duplicated")
	assert.True(t, sawClientBash, "the client's own bash definition must be kept as-is")
	assert.True(t, sawMyTool, "unrelated client tools must be preserved")
	assert.Len(t, req.Tools, 2+len(officialAgentTools)-1)
}

func TestEnsureAgentToolsIsIdempotent(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{Model: "m"}
	ensureAgentTools(req)
	first := len(req.Tools)
	ensureAgentTools(req)
	assert.Equal(t, first, len(req.Tools), "calling twice must not duplicate tools")
}

// --- SSE → JSON 聚合（兼容非流式客户端）---

func sseChunks(chunks ...string) *bytes.Reader {
	var b strings.Builder
	for _, c := range chunks {
		b.WriteString("data: ")
		b.WriteString(c)
		b.WriteString("\n\n")
	}
	b.WriteString("data: [DONE]\n\n")
	return bytes.NewReader([]byte(b.String()))
}

func TestCollapseChatCompletionsStreamAssemblesContent(t *testing.T) {
	body := sseChunks(
		`{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"zen-default","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}`,
		`{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"zen-default","choices":[{"index":0,"delta":{"content":", world"},"finish_reason":null}]}`,
		`{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"zen-default","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
		`{"id":"chatcmpl-1","object":"chat.completion.chunk","created":123,"model":"zen-default","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}}`,
	)

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	assert.Equal(t, "chat.completion", resp.Object)
	assert.Equal(t, "chatcmpl-1", resp.Id)
	assert.Equal(t, "zen-default", resp.Model)
	require.Len(t, resp.Choices, 1)
	assert.Equal(t, "assistant", resp.Choices[0].Message.Role)
	assert.Equal(t, "Hello, world", resp.Choices[0].Message.StringContent())
	assert.Equal(t, "stop", resp.Choices[0].FinishReason)
	assert.Equal(t, 14, resp.Usage.TotalTokens, "usage from the final chunk must survive")
}

func TestCollapseChatCompletionsStreamMergesReasoning(t *testing.T) {
	body := sseChunks(
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"reasoning_content":"think "},"finish_reason":null}]}`,
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"reasoning_content":"hard"},"finish_reason":null}]}`,
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":"stop"}]}`,
	)

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	require.Len(t, resp.Choices, 1)
	msg := resp.Choices[0].Message
	require.NotNil(t, msg.ReasoningContent)
	assert.Equal(t, "think hard", *msg.ReasoningContent)
	assert.Equal(t, "answer", msg.StringContent())
}

func TestCollapseChatCompletionsStreamMergesToolCallArguments(t *testing.T) {
	body := sseChunks(
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"cmd\":"}}]},"finish_reason":null}]}`,
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"ls\"}"}}]},"finish_reason":null}]}`,
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`,
	)

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	require.Len(t, resp.Choices, 1)
	calls := resp.Choices[0].Message.ParseToolCalls()
	require.Len(t, calls, 1)
	assert.Equal(t, "call_1", calls[0].ID)
	assert.Equal(t, "bash", calls[0].Function.Name)
	assert.JSONEq(t, `{"cmd":"ls"}`, calls[0].Function.Arguments)
}

func TestCollapseChatCompletionsStreamHandlesMultipleToolCalls(t *testing.T) {
	body := sseChunks(
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"a","type":"function","function":{"name":"bash","arguments":"{}"}},{"index":1,"id":"b","type":"function","function":{"name":"read","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}`,
	)

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	calls := resp.Choices[0].Message.ParseToolCalls()
	require.Len(t, calls, 2)
	assert.Equal(t, "bash", calls[0].Function.Name)
	assert.Equal(t, "read", calls[1].Function.Name)
}

func TestCollapseChatCompletionsStreamIgnoresHeartbeatsAndGarbage(t *testing.T) {
	body := bytes.NewReader([]byte(": keep-alive\n\ndata: {\"id\":\"x\",\"model\":\"m\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\ndata: not-json\n\ndata: [DONE]\n\n"))

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	require.Len(t, resp.Choices, 1)
	assert.Equal(t, "ok", resp.Choices[0].Message.StringContent())
}

func TestCollapseChatCompletionsStreamEmptyStream(t *testing.T) {
	out, err := collapseChatCompletionsStream(bytes.NewReader([]byte("data: [DONE]\n\n")))
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	assert.Equal(t, "chat.completion", resp.Object)
	require.Len(t, resp.Choices, 1)
	assert.Equal(t, "", resp.Choices[0].Message.StringContent())
}

func TestCollapseChatCompletionsStreamLastUsageWins(t *testing.T) {
	// include_usage 会在末尾补一帧只有 usage 的事件；中间帧的 usage 必须被覆盖。
	body := sseChunks(
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{"content":"a"},"finish_reason":null}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`,
		`{"id":"x","model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}`,
	)

	out, err := collapseChatCompletionsStream(body)
	require.NoError(t, err)

	var resp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(out, &resp))
	assert.Equal(t, 30, resp.Usage.TotalTokens)
	assert.Equal(t, 10, resp.Usage.PromptTokens)
}

// --- DoResponse 路由（只在需要时聚合）---

func TestDoResponseSkipsCollapseForStreamingClient(t *testing.T) {
	c := testContext(nil)
	// 未打标记 => 非流式客户端未强制流式 => 直接走官方实现。
	assert.False(t, common.GetContextKeyBool(c, contextKeyCollapseStream))
}

func TestDoResponseSkipsCollapseWhenUpstreamIsNotEventStream(t *testing.T) {
	// 上游忽略 stream 而返回 JSON 时不应尝试聚合（由 DoResponse 的内容类型判断覆盖）。
	resp := &http.Response{Header: http.Header{"Content-Type": []string{"application/json"}}}
	assert.False(t, strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream"))
}
