package opencode

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sessionIDPattern / requestIDPattern 匹配官方客户端 ID 形状：
// <prefix>_ + 12 位十六进制 + 14 位 base62，总长 26。
var (
	sessionIDPattern = `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`
	requestIDPattern = `^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$`
)

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
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{"User-Agent": ua}))
			assert.Equal(t, officialUserAgent, headers.Get("User-Agent"),
				"a non-OpenCode client must be masked as the official CLI")
		})
	}
}

// TestSetupOpenCodeHeadersRejectsOutdatedOfficialUserAgent 覆盖真实线上故障：
// 早期实现发出的 "opencode/1.3.15/cli" 版本号低于上游闸门要求（1.x 需 minor>=17），
// 会被判定为非官方客户端并返回 403 FreeTierError，因此必须被覆盖掉而非透传。
func TestSetupOpenCodeHeadersRejectsOutdatedOfficialUserAgent(t *testing.T) {
	for _, ua := range []string{"opencode/1.3.15/cli", "opencode/1.16.9", "opencode/1.0.0", "opencode/1"} {
		t.Run("ua="+ua, func(t *testing.T) {
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{"User-Agent": ua}))
			assert.Equal(t, officialUserAgent, headers.Get("User-Agent"),
				"an outdated or malformed official UA is still rejected by the free-tier gate")
		})
	}
}

func TestSetupOpenCodeHeadersPassesThroughUsableOfficialUserAgent(t *testing.T) {
	for _, ua := range []string{
		"opencode/1.18.31",
		"opencode/1.17.0",
		"opencode/1.20",
		"opencode/2.0.0",
		"OpenCode/1.18.31",
	} {
		t.Run("ua="+ua, func(t *testing.T) {
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{"User-Agent": ua}))
			assert.Equal(t, ua, headers.Get("User-Agent"),
				"a new-enough official client keeps its own UA")
		})
	}
}

func TestSetupOpenCodeHeadersTrimsOfficialUserAgent(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(map[string]string{"User-Agent": "  opencode/1.18.31  "}))
	assert.Equal(t, "opencode/1.18.31", headers.Get("User-Agent"))
}

func TestSetupOpenCodeHeadersSetsClientName(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, clientName, headers.Get("x-opencode-client"))
}

// TestSetupOpenCodeHeadersSendsFullOfficialFingerprint 覆盖对照参考实现补全的
// 全部特征头：Accept、两个会话关联别名、工程标识。
func TestSetupOpenCodeHeadersSendsFullOfficialFingerprint(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))

	assert.Equal(t, "application/json, text/event-stream", headers.Get("Accept"),
		"the official CLI advertises native SSE support")

	session := headers.Get("x-opencode-session")
	assert.Regexp(t, sessionIDPattern, session)

	// 1.18.x 同时发送这些关联头以维持上游亲和性。
	assert.Equal(t, session, headers.Get("x-session-affinity"))
	assert.Equal(t, session, headers.Get("X-Session-Id"))

	assert.Regexp(t, `^prj_[0-9a-f]{24}$`, headers.Get("x-opencode-project"))
}

func TestSetupOpenCodeHeadersProjectFollowsSession(t *testing.T) {
	const session = "ses_0123456789ab0123456789QQQQ"

	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(map[string]string{"x-opencode-session": session}))

	// 工程标识必须与会话对齐，且可复现，便于上游做工程级关联。
	assert.Equal(t, projectIDForSignal(session), headers.Get("x-opencode-project"))
}

func TestSetupOpenCodeHeadersKeepsExplicitProject(t *testing.T) {
	const explicit = "prj_0123456789abcdef01234567"
	headers := http.Header{}
	headers.Set("x-opencode-project", explicit)
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, explicit, headers.Get("x-opencode-project"),
		"an explicitly provided project id must not be overwritten")
}

func TestSetupOpenCodeHeadersDoesNotInventParentSession(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Empty(t, headers.Get("x-parent-session-id"),
		"the parent session is optional and must only be forwarded when the client supplies it")
}

func TestSetupOpenCodeHeadersGeneratesOfficialShapedIDs(t *testing.T) {
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(nil))

	session := headers.Get("x-opencode-session")
	request := headers.Get("x-opencode-request")
	require.NotEmpty(t, session)
	require.NotEmpty(t, request)

	// 上游按形状校验；UUID 会被视为非官方客户端。
	assert.Regexp(t, sessionIDPattern, session)
	assert.Regexp(t, requestIDPattern, request)
	assert.NotEqual(t, session, request)

	other := http.Header{}
	SetupOpenCodeHeaders(&other, testContext(nil))
	assert.NotEqual(t, session, other.Get("x-opencode-session"))
}

func TestIsOpenCodeClientID(t *testing.T) {
	valid := []struct{ id, prefix string }{
		{"ses_0123456789ab0123456789ABCD", "ses"},
		{"msg_0123456789ab0123456789abcd", "msg"},
		{"ses_ffffffffffffZZZZZZZZZZZZZZ", "ses"},
	}
	for _, tc := range valid {
		assert.True(t, isOpenCodeClientID(tc.id, tc.prefix), tc.id)
	}

	invalid := []struct{ id, prefix string }{
		{"", "ses"},
		{"ses_", "ses"},
		{"ses_0123456789ab0123456789ABC", "ses"},   // 太短
		{"ses_0123456789ab0123456789ABCDE", "ses"}, // 太长
		{"msg_0123456789ab0123456789ABCD", "ses"},  // 前缀不匹配
		{"ses_0123456789AB0123456789ABCD", "ses"},  // 时间字段必须小写十六进制
		{"ses_0123456789ab0123456789ABC!", "ses"},  // 非法 base62 字符
		{"550e8400-e29b-41d4-a716-446655440000", "ses"},
	}
	for _, tc := range invalid {
		assert.False(t, isOpenCodeClientID(tc.id, tc.prefix), tc.id)
	}
}

func TestNewClientIDEmbedsFreshTimestamp(t *testing.T) {
	id := newClientID(sessionIDPrefix, true)
	require.Regexp(t, sessionIDPattern, id)

	// descending 会话 ID 的 48 位时间字段是取反后的值，可解回毫秒时间戳。
	var encoded uint64
	for _, r := range id[len("ses_"):][:idTimeHexLength] {
		encoded = encoded<<4 | uint64(strings.IndexRune("0123456789abcdef", r))
	}
	const timeMask = 1<<48 - 1
	recovered := int64((^encoded & timeMask) / 0x1000)

	// 48 位字段在高位溢出后只保留时间戳的低 36 位（约 2.2 年回绕一次，与官方
	// 生成器一致），因此按同一回绕窗口比较。
	const wrap = 1 << 36
	want := time.Now().UnixMilli() % wrap
	assert.InDelta(t, want, recovered, 2000, "the embedded timestamp must be current")
}

func TestSetupOpenCodeHeadersInheritsValidClientSession(t *testing.T) {
	const valid = "ses_0123456789ab0123456789ABCD"
	for _, name := range sessionHeaderCandidates {
		t.Run("header="+name, func(t *testing.T) {
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{name: valid}))
			assert.Equal(t, valid, headers.Get("x-opencode-session"))
		})
	}
}

// TestSetupOpenCodeHeadersRejectsMalformedSession 说明：形状非法的会话（例如普通
// UUID）不会被透传，而是替换为官方格式 ID —— 透传会让上游再次判定为非官方客户端。
func TestSetupOpenCodeHeadersRejectsMalformedSession(t *testing.T) {
	for _, bad := range []string{
		"550e8400-e29b-41d4-a716-446655440000",
		"   ",
		"ses_short",
		"not-a-session",
	} {
		t.Run("session="+bad, func(t *testing.T) {
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{"x-opencode-session": bad}))
			got := headers.Get("x-opencode-session")
			assert.NotEqual(t, bad, got)
			assert.Regexp(t, sessionIDPattern, got)
		})
	}
}

func TestSetupOpenCodeHeadersSessionPrecedence(t *testing.T) {
	const first = "ses_0123456789ab0123456789AAAA"
	const second = "ses_0123456789ab0123456789BBBB"

	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(map[string]string{
		"x-opencode-session": first,
		"x-session-id":       second,
	}))
	assert.Equal(t, first, headers.Get("x-opencode-session"))

	// 与参考实现一致：取**第一个非空**信号后规范化，而不是跳过形状非法的值去用下一个。
	// 这样同一会话的标识始终由同一个来源决定，不会在轮次之间漂移。
	headers = http.Header{}
	SetupOpenCodeHeaders(&headers, testContext(map[string]string{
		"x-opencode-session": "bad",
		"x-session-id":       second,
	}))
	got := headers.Get("x-opencode-session")
	assert.NotEqual(t, "bad", got)
	assert.Regexp(t, sessionIDPattern, got)
	assert.NotEqual(t, second, got, "the first non-empty signal wins, so the second is not used")
}

func TestSetupOpenCodeHeadersInheritsAliasSessionHeaders(t *testing.T) {
	const canonical = "ses_0123456789ab0123456789FFFF"
	for _, name := range []string{"x-session-affinity", "X-Session-Id", "conversation-id"} {
		t.Run("header="+name, func(t *testing.T) {
			headers := http.Header{}
			SetupOpenCodeHeaders(&headers, testContext(map[string]string{name: canonical}))
			assert.Equal(t, canonical, headers.Get("x-opencode-session"),
				"1.18.x correlation aliases must be recognised as session signals")
		})
	}
}

func TestSetupOpenCodeHeadersCanonicalizesForeignSession(t *testing.T) {
	// 非官方形状的下行信号（UUID、外部客户端会话）不应被丢弃：丢弃会让多轮对话
	// 每轮换一个上游会话，从而失去 prompt 缓存亲和性。应确定性规范化。
	const uuid = "550e8400-e29b-41d4-a716-446655440000"

	first := http.Header{}
	SetupOpenCodeHeaders(&first, testContext(map[string]string{"x-opencode-session": uuid}))
	got := first.Get("x-opencode-session")
	assert.Regexp(t, sessionIDPattern, got)

	// 同一输入必须得到同一会话（确定性），不同输入必须得到不同会话。
	second := http.Header{}
	SetupOpenCodeHeaders(&second, testContext(map[string]string{"x-opencode-session": uuid}))
	assert.Equal(t, got, second.Get("x-opencode-session"), "the same signal must map to the same session")

	other := http.Header{}
	SetupOpenCodeHeaders(&other, testContext(map[string]string{"x-opencode-session": "another-session"}))
	assert.NotEqual(t, got, other.Get("x-opencode-session"))
}

func TestCanonicalSessionIDPreservesOfficialShape(t *testing.T) {
	const official = "ses_0123456789ab0123456789ZZZZ"
	assert.Equal(t, official, canonicalSessionID(official), "an official session must pass through unchanged")
}

func TestProjectIDForSignalIsStableAndShaped(t *testing.T) {
	projectPattern := `^prj_[0-9a-f]{24}$`
	first := projectIDForSignal("session-a")
	assert.Regexp(t, projectPattern, first)
	assert.Equal(t, first, projectIDForSignal("session-a"), "the project id must be deterministic")
	assert.NotEqual(t, first, projectIDForSignal("session-b"))
}

func TestSetupOpenCodeHeadersKeepsExistingSessionHeader(t *testing.T) {
	const preset = "ses_0123456789ab0123456789CCCC"
	headers := http.Header{}
	headers.Set("x-opencode-session", preset)
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, preset, headers.Get("x-opencode-session"))
}

func TestSetupOpenCodeHeadersAlwaysRefreshesRequestID(t *testing.T) {
	// x-opencode-request 标识「本次请求」，不可继承，必须每次生成新值。
	headers := http.Header{}
	headers.Set("x-opencode-request", "msg_0123456789ab0123456789DDDD")
	SetupOpenCodeHeaders(&headers, testContext(nil))

	got := headers.Get("x-opencode-request")
	assert.NotEqual(t, "msg_0123456789ab0123456789DDDD", got)
	assert.Regexp(t, requestIDPattern, got)
}

func TestSetupOpenCodeHeadersKeepsExistingClientHeader(t *testing.T) {
	headers := http.Header{}
	headers.Set("x-opencode-client", "desktop")
	SetupOpenCodeHeaders(&headers, testContext(nil))
	assert.Equal(t, "desktop", headers.Get("x-opencode-client"),
		"an explicitly provided client marker must not be overwritten")
}

func TestSetupOpenCodeHeadersWithoutGinContext(t *testing.T) {
	// 后台拉取模型时没有请求上下文，仍须补齐指纹。
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, nil)

	assert.Equal(t, officialUserAgent, headers.Get("User-Agent"))
	assert.Equal(t, clientName, headers.Get("x-opencode-client"))
	assert.Regexp(t, sessionIDPattern, headers.Get("x-opencode-session"))
	assert.Regexp(t, requestIDPattern, headers.Get("x-opencode-request"))
}

func TestSetupOpenCodeHeadersNilHeaderIsSafe(t *testing.T) {
	assert.NotPanics(t, func() {
		SetupOpenCodeHeaders(nil, testContext(nil))
	})
}

func TestSetupOpenCodeHeadersAllowsHeaderOverrideToWin(t *testing.T) {
	// 模拟转发链路：先 SetupRequestHeader 注入指纹，再套用 header_override。
	c := testContext(map[string]string{"User-Agent": "Cursor/0.42.0"})
	headers := http.Header{}
	SetupOpenCodeHeaders(&headers, c)

	overrides := map[string]string{
		"User-Agent":         "custom-agent/9.9",
		"x-opencode-client":  "custom-client",
		"x-opencode-session": "ses_0123456789ab0123456789EEEE",
	}
	for k, v := range overrides {
		headers.Set(k, v)
	}

	assert.Equal(t, "custom-agent/9.9", headers.Get("User-Agent"))
	assert.Equal(t, "custom-client", headers.Get("x-opencode-client"))
	assert.Equal(t, "ses_0123456789ab0123456789EEEE", headers.Get("x-opencode-session"))
}

func TestAdaptorGetChannelNameAndModels(t *testing.T) {
	adaptor := &Adaptor{}
	assert.Equal(t, "opencode", adaptor.GetChannelName())
	assert.NotEmpty(t, adaptor.GetModelList())
	assert.Contains(t, adaptor.GetModelList(), "zen-default")
}

func TestNewClientIDIsUniqueAcrossRapidCalls(t *testing.T) {
	seen := make(map[string]bool)
	for range 2000 {
		id := newClientID(requestIDPrefix, false)
		require.False(t, seen[id], "duplicate id generated: %s", id)
		seen[id] = true
	}
}

func TestHasUsableOfficialUA(t *testing.T) {
	usable := []string{"opencode/1.17.0", "opencode/1.18.31", "opencode/2.0.0", "OpenCode/1.17"}
	for _, ua := range usable {
		assert.True(t, hasUsableOfficialUA(ua), ua)
	}
	unusable := []string{"", "opencode/", "opencode", "opencode/1", "opencode/1.16", "opencode/0.9.9",
		"opencode/x.y", "Cursor/1.0", "opencode/1.17-suffix"}
	for _, ua := range unusable {
		assert.False(t, hasUsableOfficialUA(ua), ua)
	}
}
