package opencode

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uuidV4Pattern 匹配标准 RFC 4122 v4 UUID（第三段以 4 开头、第四段以 8/9/a/b 开头）。
var uuidV4Pattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func testContext(clientHeaders map[string]string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	for k, v := range clientHeaders {
		c.Request.Header.Set(k, v)
	}
	return c
}

func TestSetupOpenCodeHeadersOverridesForeignUserAgent(t *testing.T) {
	foreign := []string{
		"Cursor/0.42.0",
		"CherryStudio/1.0.0",
		"NextChat",
		"python-requests/2.31.0",
		"curl/8.4.0",
		"",
	}
	for _, ua := range foreign {
		t.Run("ua="+ua, func(t *testing.T) {
			c := testContext(map[string]string{"User-Agent": ua})
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, c)
			assert.Equal(t, officialUserAgent, headers.Get("User-Agent"),
				"a non-OpenCode client must be masked as the official CLI")
		})
	}
}

func TestSetupOpenCodeHeadersPassesThroughOfficialUserAgent(t *testing.T) {
	cases := []string{
		"opencode/1.3.15/cli",
		"opencode/1.0.0/cursor",
		"opencode/dev",
		"OpenCode/1.3.15/cli",
	}
	for _, ua := range cases {
		t.Run("ua="+ua, func(t *testing.T) {
			c := testContext(map[string]string{"User-Agent": ua})
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, c)
			assert.Equal(t, ua, headers.Get("User-Agent"),
				"a request already coming from the official CLI must keep its own UA")
		})
	}
}

func TestSetupOpenCodeHeadersSetsClientName(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, clientName, headers.Get("x-opencode-client"))
}

func TestSetupOpenCodeHeadersGeneratesSessionWhenMissing(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))

	session := headers.Get("x-opencode-session")
	require.NotEmpty(t, session, "a session id prevents upstream 400 MissingSessionID")
	assert.Regexp(t, uuidV4Pattern, session)

	// 每次调用必须生成不同的会话，避免跨请求串号。
	other := http.Header{}
	SetupOpenCodeHeaders(&other, testContext(nil))
	assert.NotEqual(t, session, other.Get("x-opencode-session"))
}

func TestSetupOpenCodeHeadersInheritsClientSession(t *testing.T) {
	for _, name := range sessionHeaderCandidates {
		t.Run("header="+name, func(t *testing.T) {
			c := testContext(map[string]string{name: "client-session-abc"})
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, c)
			assert.Equal(t, "client-session-abc", headers.Get("x-opencode-session"))
		})
	}
}

func TestSetupOpenCodeHeadersSessionPrecedence(t *testing.T) {
	// x-opencode-session 优先于 x-session-id 与 session-id。
	c := testContext(map[string]string{
		"x-opencode-session": "first",
		"x-session-id":       "second",
		"session-id":         "third",
	})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)
	assert.Equal(t, "first", headers.Get("x-opencode-session"))

	// 缺 x-opencode-session 时回退到 x-session-id。
	c = testContext(map[string]string{"x-session-id": "second", "session-id": "third"})
	headers = http.Header{}
	SetupOpenCodeHeaders(&headers, c)
	assert.Equal(t, "second", headers.Get("x-opencode-session"))
}

func TestSetupOpenCodeHeadersBlankSessionFallsBackToGenerated(t *testing.T) {
	// 客户端传了空白值等同于未传，必须生成而不是透传空串。
	c := testContext(map[string]string{"x-opencode-session": "   "})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)
	assert.Regexp(t, uuidV4Pattern, headers.Get("x-opencode-session"))
}

func TestSetupOpenCodeHeadersKeepsExistingSessionHeader(t *testing.T) {
	// header 上已有会话（例如由上游调用方预设）时不得覆盖。
	headers := http.Header{}
	headers.Set("x-opencode-session", "preset-session")
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, "preset-session", headers.Get("x-opencode-session"))
}

func TestSetupOpenCodeHeadersInjectsUniqueRequestID(t *testing.T) {
	first := http.Header{}
	SetupOpenCodeHeaders(&first, testContext(nil))
	requestID := first.Get("x-opencode-request")
	assert.Regexp(t, uuidV4Pattern, requestID)

	// 每次请求都必须换新的 request id。
	second := http.Header{}
	SetupOpenCodeHeaders(&second, testContext(nil))
	assert.NotEqual(t, requestID, second.Get("x-opencode-request"))
}

func TestSetupOpenCodeHeadersAlwaysRefreshesRequestID(t *testing.T) {
	// 规格要求 x-opencode-request 每次请求都生成新的唯一 UUID，因此即使调用方已预设
	// 一个值也必须被替换（该头标识"本次请求"，不是可继承的会话标识）。
	headers := http.Header{}
	headers.Set("x-opencode-request", "preset-request")
	SetupOpenCodeHeaders(&headers, testContext(nil))

	got := headers.Get("x-opencode-request")
	assert.NotEqual(t, "preset-request", got)
	assert.Regexp(t, uuidV4Pattern, got)
}

func TestSetupOpenCodeHeadersKeepsExistingClientHeader(t *testing.T) {
	headers := http.Header{}
	headers.Set("x-opencode-client", "sdk")
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, "sdk", headers.Get("x-opencode-client"),
		"an explicitly provided client marker must not be overwritten")
}

func TestSetupOpenCodeHeadersWithoutGinContext(t *testing.T) {
	// 后台拉取模型时没有请求上下文，仍须补齐指纹。
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, nil)

	assert.Equal(t, officialUserAgent, headers.Get("User-Agent"))
	assert.Equal(t, clientName, headers.Get("x-opencode-client"))
	assert.Regexp(t, uuidV4Pattern, headers.Get("x-opencode-session"))
	assert.Regexp(t, uuidV4Pattern, headers.Get("x-opencode-request"))
}

func TestSetupOpenCodeHeadersNilHeaderIsSafe(t *testing.T) {
	assert.NotPanics(t, func() {
		SetupOpenCodeHeaders(nil, testContext(nil))
	})
}

func TestSetupOpenCodeHeadersAllowsHeaderOverrideToWin(t *testing.T) {
	// 模拟转发链路：先 SetupRequestHeader 注入指纹，再套用 header_override。
	// 最终值必须来自 override（与 channel.DoApiRequest 的顺序一致）。
	c := testContext(map[string]string{"User-Agent": "Cursor/0.42.0"})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)

	overrides := map[string]string{
		"User-Agent":         "custom-agent/9.9",
		"x-opencode-client":  "custom-client",
		"x-opencode-session": "custom-session",
	}
	for k, v := range overrides {
		headers.Set(k, v)
	}

	assert.Equal(t, "custom-agent/9.9", headers.Get("User-Agent"))
	assert.Equal(t, "custom-client", headers.Get("x-opencode-client"))
	assert.Equal(t, "custom-session", headers.Get("x-opencode-session"))
}

func TestAdaptorGetChannelNameAndModels(t *testing.T) {
	adaptor := &Adaptor{}
	assert.Equal(t, "opencode", adaptor.GetChannelName())
	assert.NotEmpty(t, adaptor.GetModelList())
	assert.Contains(t, adaptor.GetModelList(), "zen-default")
}

func TestSetupOpenCodeHeadersUserAgentPrefixIsCaseInsensitive(t *testing.T) {
	c := testContext(map[string]string{"User-Agent": "OPEncode/2.0/cli"})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)
	assert.Equal(t, "OPEncode/2.0/cli", headers.Get("User-Agent"),
		"the official prefix check must be case-insensitive but preserve the original value")
}

func TestSetupOpenCodeHeadersTrimsOfficialUserAgent(t *testing.T) {
	c := testContext(map[string]string{"User-Agent": "  opencode/1.3.15/cli  "})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)
	assert.Equal(t, "opencode/1.3.15/cli", headers.Get("User-Agent"))
	assert.False(t, strings.HasPrefix(headers.Get("User-Agent"), " "),
		"the forwarded UA must not keep surrounding whitespace")
}
