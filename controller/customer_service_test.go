package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/console_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCustomerServiceValidation(t *testing.T) {
	// Valid customer service json
	validJSON := `[
		{
			"id": 1,
			"title": "官方微信客服",
			"contact": "newapi_support",
			"description": "周一至周日 09:00 - 22:00 在线响应",
			"qrcode": "https://example.com/wechat-qr.png",
			"link": "https://example.com/support",
			"color": "green"
		},
		{
			"id": 2,
			"title": "Telegram 技术支持",
			"contact": "@newapi_tech",
			"description": "7x24小时工单响应",
			"qrcode": "",
			"link": "https://t.me/newapi_tech",
			"color": "blue"
		}
	]`
	err := console_setting.ValidateConsoleSettings(validJSON, "CustomerService")
	assert.NoError(t, err)

	// Valid with Data URL qrcode
	validDataURLJSON := `[
		{
			"id": 3,
			"title": "微信客服二维码",
			"qrcode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
		}
	]`
	err = console_setting.ValidateConsoleSettings(validDataURLJSON, "CustomerService")
	assert.NoError(t, err)

	// Invalid json
	invalidJSON := `[{"title": ""}]`
	err = console_setting.ValidateConsoleSettings(invalidJSON, "CustomerService")
	assert.Error(t, err)

	// Malformed json
	malformedJSON := `not-a-json`
	err = console_setting.ValidateConsoleSettings(malformedJSON, "CustomerService")
	assert.Error(t, err)

	// Dangerous content in title/link/qrcode
	scriptJSON := `[{"title": "客服<script>alert(1)</script>"}]`
	err = console_setting.ValidateConsoleSettings(scriptJSON, "CustomerService")
	assert.Error(t, err)

	jsLinkJSON := `[{"title": "客服", "link": "javascript:alert(1)"}]`
	err = console_setting.ValidateConsoleSettings(jsLinkJSON, "CustomerService")
	assert.Error(t, err)

	invalidQRURLJSON := `[{"title": "客服", "qrcode": "ftp://example.com/qr.png"}]`
	err = console_setting.ValidateConsoleSettings(invalidQRURLJSON, "CustomerService")
	assert.Error(t, err)
}

func TestOptionLogoValidation(t *testing.T) {
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	previousDB := model.DB
	model.DB = db
	defer func() {
		model.DB = previousDB
	}()
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	model.InitOptionMap()

	// Valid logos
	assert.NoError(t, model.UpdateOption("Logo", "/logo.png"))
	assert.NoError(t, model.UpdateOption("Logo", "https://example.com/logo.png"))
	assert.NoError(t, model.UpdateOption("Logo", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="))
	assert.NoError(t, model.UpdateOption("Logo", ""))

	// Invalid logos
	assert.Error(t, model.UpdateOption("Logo", "javascript:alert(1)"))
	assert.Error(t, model.UpdateOption("Logo", "data:image/svg+xml;utf8,<svg><script>alert(1)</script></svg>"))
	assert.Error(t, model.UpdateOption("Logo", "ftp://example.com/logo.png"))
}

func TestGetStatusCustomerService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, _ := newAuditTestDatabase(t, "sqlite", "")
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	defer func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
	}()

	cs := console_setting.GetConsoleSetting()
	origEnabled := cs.CustomerServiceEnabled
	origCS := cs.CustomerService
	defer func() {
		cs.CustomerServiceEnabled = origEnabled
		cs.CustomerService = origCS
	}()

	// 1. When disabled
	cs.CustomerServiceEnabled = false
	cs.CustomerService = ""

	r := gin.New()
	r.GET("/status", GetStatus)

	req1 := httptest.NewRequest(http.MethodGet, "/status", nil)
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)

	var resp1 map[string]any
	require.NoError(t, json.Unmarshal(w1.Body.Bytes(), &resp1))
	data1 := resp1["data"].(map[string]any)
	assert.False(t, data1["customer_service_enabled"].(bool))
	assert.Nil(t, data1["customer_service"])

	// 2. When enabled with items
	cs.CustomerServiceEnabled = true
	sampleItems := `[
		{
			"id": 1,
			"title": "在线客服",
			"contact": "support@example.com",
			"description": "快速响应",
			"qrcode": "https://example.com/qr.png",
			"link": "https://example.com"
		}
	]`
	cs.CustomerService = sampleItems

	// Verify updateConfigFromMap
	cfg := config.GlobalConfig.Get("console_setting")
	require.NotNil(t, cfg)
	err := config.UpdateConfigFromMap(cfg, map[string]string{
		"customer_service_enabled": "true",
		"customer_service":         sampleItems,
	})
	require.NoError(t, err)

	req2 := httptest.NewRequest(http.MethodGet, "/status", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	var resp2 map[string]any
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp2))
	data2 := resp2["data"].(map[string]any)
	assert.True(t, data2["customer_service_enabled"].(bool))
	csList, ok := data2["customer_service"].([]any)
	require.True(t, ok)
	require.Len(t, csList, 1)
	item := csList[0].(map[string]any)
	assert.Equal(t, "在线客服", item["title"])
	assert.Equal(t, "https://example.com/qr.png", item["qrcode"])
}
