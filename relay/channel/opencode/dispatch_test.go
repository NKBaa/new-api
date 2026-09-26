package opencode

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// captureUpstream 起一个真实 HTTP 服务器，返回它实际收到的请求头与请求体。
func captureUpstream(t *testing.T) (*httptest.Server, *http.Header, *string) {
	t.Helper()
	var header http.Header
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header = r.Header.Clone()
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[]}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &header, &body
}

func openCodeInfo(baseURL string) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeOpenCode,
			ChannelBaseUrl: baseURL,
			ApiKey:         "sk-test",
		},
		RelayMode: relayconstant.RelayModeChatCompletions,
	}
}

// TestDoRequestSendsOpenCodeFingerprint 是分发缺陷的回归测试。
//
// openai.Adaptor.DoRequest 内部把**静态接收者**传给 channel.DoApiRequest；若本包
// 不覆写 DoRequest，传下去的是 *openai.Adaptor，SetupRequestHeader 会分发到
// openai 的实现，指纹被完全旁路，上游只看到 Go-http-client/1.1 —— 必然 403。
//
// 这里用真实 HTTP 服务器抓包，因此能捕获「方法根本没被调用」这类直接调用
// SetupOpenCodeHeaders 的单元测试无法发现的问题。
func TestDoRequestSendsOpenCodeFingerprint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv, header, _ := captureUpstream(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"m"}`))

	adaptor := &Adaptor{}
	_, err := adaptor.DoRequest(c, openCodeInfo(srv.URL), strings.NewReader(`{"model":"m","messages":[]}`))
	require.NoError(t, err)

	assert.Equal(t, officialUserAgent, header.Get("User-Agent"),
		"the opencode fingerprint must actually reach upstream")
	assert.Equal(t, clientName, header.Get("x-opencode-client"))
	assert.Regexp(t, sessionIDPattern, header.Get("x-opencode-session"))
	assert.Regexp(t, requestIDPattern, header.Get("x-opencode-request"))
	assert.Equal(t, "application/json, text/event-stream", header.Get("Accept"))
	assert.Regexp(t, `^prj_[0-9a-f]{24}$`, header.Get("x-opencode-project"))
	assert.NotEqual(t, "Go-http-client/1.1", header.Get("User-Agent"),
		"a Go default UA means SetupRequestHeader was bypassed")
}

// TestDoRequestShapesPassthroughBody 覆盖透传模式：该模式绕过
// ConvertOpenAIRequest，若不在 DoRequest 兜底，请求体将缺少 agent 形状而 100% 403。
func TestDoRequestShapesPassthroughBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv, header, body := captureUpstream(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions",
		strings.NewReader(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`))

	// 模拟透传：请求体未经过 Converter。
	adaptor := &Adaptor{}
	raw := strings.NewReader(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
	_, err := adaptor.DoRequest(c, openCodeInfo(srv.URL), raw)
	require.NoError(t, err)

	var sent map[string]any
	require.NoError(t, common.UnmarshalJsonStr(*body, &sent))

	assert.Equal(t, true, sent["stream"], "a passthrough body must still be force-streamed")
	assert.Contains(t, *body, `"bash"`)
	assert.Contains(t, *body, `"read"`)
	assert.Contains(t, *body, `"edit"`)
	assert.Contains(t, *body, `"glob"`)
	assert.Contains(t, *body, `"grep"`)
	assert.Equal(t, "application/json, text/event-stream", header.Get("Accept"))

	// 非流式客户端要拿到 JSON，因此必须打上聚合标记。
	assert.True(t, common.GetContextKeyBool(c, contextKeyCollapseStream))
}

func TestDoRequestLeavesHealthyPassthroughStreamingAlone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv, _, body := captureUpstream(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	adaptor := &Adaptor{}
	// 客户端本来就要求流式：不应打聚合标记。
	raw := strings.NewReader(`{"model":"m","messages":[],"stream":true}`)
	_, err := adaptor.DoRequest(c, openCodeInfo(srv.URL), raw)
	require.NoError(t, err)

	var sent map[string]any
	require.NoError(t, common.UnmarshalJsonStr(*body, &sent))
	assert.Equal(t, true, sent["stream"])
	assert.False(t, common.GetContextKeyBool(c, contextKeyCollapseStream),
		"a streaming passthrough client must not be marked for collapse")
}

func TestDoRequestDoesNotRewriteNonChatModes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv, _, body := captureUpstream(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/embeddings", nil)

	info := openCodeInfo(srv.URL)
	info.RelayMode = relayconstant.RelayModeEmbeddings

	adaptor := &Adaptor{}
	original := `{"model":"m","input":"hello"}`
	_, err := adaptor.DoRequest(c, info, strings.NewReader(original))
	require.NoError(t, err)

	assert.Equal(t, original, *body, "non-chat bodies must be forwarded byte-for-byte")
}

func TestDoRequestLeavesNonJSONBodyUntouched(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv, _, body := captureUpstream(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	adaptor := &Adaptor{}
	original := "not-json-at-all"
	_, err := adaptor.DoRequest(c, openCodeInfo(srv.URL), strings.NewReader(original))
	require.NoError(t, err)

	assert.Equal(t, original, *body, "an unparsable body must be forwarded as-is")
}

func TestShapePassthroughBodySkipsAlreadyShapedRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(c, contextKeyAgentShaped, true)

	original := `{"model":"m"}`
	out, err := shapePassthroughBody(c, openCodeInfo("http://127.0.0.1:1"), strings.NewReader(original))
	require.NoError(t, err)

	got, err := io.ReadAll(out)
	require.NoError(t, err)
	assert.Equal(t, original, string(got), "an already-shaped body must not be re-processed")
}
