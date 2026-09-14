package controller

import (
	"bytes"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAffiliateRewardTestDB(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedis := common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AffiliateReward{}, &model.Log{}))
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedis
	})
}

func TestAddAffiliateRewardIsIdempotentAndOnlyTouchesAffiliateQuota(t *testing.T) {
	setupAffiliateRewardTestDB(t)
	paymentSetting := operation_setting.GetPaymentSetting()
	oldConfirmed, oldTerms := paymentSetting.ComplianceConfirmed, paymentSetting.ComplianceTermsVersion
	t.Cleanup(func() {
		paymentSetting.ComplianceConfirmed = oldConfirmed
		paymentSetting.ComplianceTermsVersion = oldTerms
	})
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	user := model.User{Id: 42, Username: "invite-owner", Password: "hash", Quota: 7, AffCount: 3}
	require.NoError(t, model.DB.Create(&user).Error)

	call := func() *httptest.ResponseRecorder {
		body := bytes.NewBufferString(`{"reference":"topup-100","user_id":42,"reward_quota":100}`)
		req := httptest.NewRequest("POST", "/api/user/aff/reward", body)
		req.Header.Set("Content-Type", "application/json")
		resp := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(resp)
		ctx.Request = req
		AddAffiliateReward(ctx)
		return resp
	}

	first := call()
	require.Equal(t, 200, first.Code)
	var after model.User
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, 100, after.AffQuota)
	assert.Equal(t, 100, after.AffHistoryQuota)
	assert.Equal(t, 3, after.AffCount)
	assert.Equal(t, 7, after.Quota)

	second := call()
	require.Equal(t, 200, second.Code)
	require.NoError(t, model.DB.First(&after, user.Id).Error)
	assert.Equal(t, 100, after.AffQuota)
	assert.Equal(t, 100, after.AffHistoryQuota)

	conflict := bytes.NewBufferString(`{"reference":"topup-100","user_id":42,"reward_quota":101}`)
	req := httptest.NewRequest("POST", "/api/user/aff/reward", conflict)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(resp)
	ctx.Request = req
	AddAffiliateReward(ctx)
	assert.Equal(t, 409, resp.Code)
}
