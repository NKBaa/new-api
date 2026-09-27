package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionRejectsRetiredFrontendTheme(t *testing.T) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/option/",
		strings.NewReader(`{"key":"theme.frontend","value":"classic"}`),
	)

	UpdateOption(context)

	assert.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"Classic 前端已移除，主题只能设置为 default"}`, response.Body.String())
}

func TestGetStatusAdvertisesDefaultDashboard(t *testing.T) {
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Equal(t, "default", payload.Data["theme"])
}

// 首页风格只允许 classic（官方首页）和 landing-v2（OpenRouter 风格首页），
// 非法取值必须被拒绝且不落库，合法取值要持久化并通过 /api/status 下发，
// 前端根路由据此决定渲染哪个首页。
func TestHomePageStyleOptionIsValidatedAndAdvertised(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	previousDB := model.DB
	model.DB = db
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{"HomePageStyle": "classic"}
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMap = previousMap
	})

	assert.Error(t, model.UpdateOption("HomePageStyle", "landing-v3"))
	assert.Error(t, model.UpdateOption("HomePageStyle", ""))
	assert.Equal(t, "classic", common.OptionMap["HomePageStyle"])
	var rejected model.Option
	assert.ErrorIs(t, db.Where(&model.Option{Key: "HomePageStyle"}).First(&rejected).Error, gorm.ErrRecordNotFound)

	require.NoError(t, model.UpdateOption("HomePageStyle", "landing-v2"))
	assert.Equal(t, "landing-v2", common.OptionMap["HomePageStyle"])
	var stored model.Option
	require.NoError(t, db.Where(&model.Option{Key: "HomePageStyle"}).First(&stored).Error)
	assert.Equal(t, "landing-v2", stored.Value)

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Equal(t, "landing-v2", payload.Data["home_page_style"])
}
