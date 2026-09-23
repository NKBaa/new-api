package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestCreateAffiliateReward(t *testing.T) {
	setupUserUpdateTestState(t)

	// Create test inviter user
	inviter := User{
		Id:              100,
		Username:        "inviter",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-100",
		AffQuota:        1000,
		AffHistoryQuota: 2000,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	// 1. Invalid params check
	assert.ErrorIs(t, CreateAffiliateReward("", 100, 500), ErrInvalidAffiliateReward)
	assert.ErrorIs(t, CreateAffiliateReward("topup-1", 0, 500), ErrInvalidAffiliateReward)
	assert.ErrorIs(t, CreateAffiliateReward("topup-1", 100, 0), ErrInvalidAffiliateReward)
	assert.ErrorIs(t, CreateAffiliateReward("topup-1", 100, -10), ErrInvalidAffiliateReward)

	// 2. Successful reward creation
	err := CreateAffiliateReward("topup-1", 100, 700)
	require.NoError(t, err)

	// Verify inviter's aff_quota and aff_history updated
	var updatedInviter User
	require.NoError(t, DB.First(&updatedInviter, 100).Error)
	assert.Equal(t, 1700, updatedInviter.AffQuota)
	assert.Equal(t, 2700, updatedInviter.AffHistoryQuota)

	// 3. Duplicate reference (Idempotency test)
	dupErr := CreateAffiliateReward("topup-1", 100, 700)
	assert.ErrorIs(t, dupErr, ErrAffiliateRewardAlreadyProcessed)

	// Verify balances remained intact
	require.NoError(t, DB.First(&updatedInviter, 100).Error)
	assert.Equal(t, 1700, updatedInviter.AffQuota)
	assert.Equal(t, 2700, updatedInviter.AffHistoryQuota)
}

func TestProcessTopUpAffiliateReward(t *testing.T) {
	setupUserUpdateTestState(t)

	oldRate := common.AffiliateCommissionRate
	defer func() {
		common.AffiliateCommissionRate = oldRate
	}()

	// Create inviter and invitee
	inviter := User{
		Id:              200,
		Username:        "inviter2",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-200",
		AffQuota:        0,
		AffHistoryQuota: 0,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	invitee := User{
		Id:        201,
		Username:  "invitee2",
		Password:  "password",
		Role:      common.RoleCommonUser,
		Status:    common.UserStatusEnabled,
		AffCode:   "aff-invitee-201",
		InviterId: 200,
	}
	require.NoError(t, DB.Create(&invitee).Error)

	topUp := &TopUp{
		Id:            555,
		UserId:        201,
		Amount:        10,
		PaymentMethod: "epay",
		Status:        common.TopUpStatusSuccess,
	}
	require.NoError(t, DB.Create(topUp).Error)

	// Case 1: Rate is 0 -> No reward processed
	common.AffiliateCommissionRate = 0.0
	processTopUpAffiliateReward(topUp, 1000000)
	var checkUser User
	require.NoError(t, DB.First(&checkUser, 200).Error)
	assert.Equal(t, 0, checkUser.AffQuota)

	// Case 2: Rate is 7.0 (7%) -> Reward = 1000000 * 7% = 70000
	common.AffiliateCommissionRate = 7.0
	processTopUpAffiliateReward(topUp, 1000000)
	require.NoError(t, DB.First(&checkUser, 200).Error)
	assert.Equal(t, 70000, checkUser.AffQuota)
	assert.Equal(t, 70000, checkUser.AffHistoryQuota)

	// Case 3: Duplicate call with same topup -> Idempotent, no double reward
	processTopUpAffiliateReward(topUp, 1000000)
	require.NoError(t, DB.First(&checkUser, 200).Error)
	assert.Equal(t, 70000, checkUser.AffQuota)
	assert.Equal(t, 70000, checkUser.AffHistoryQuota)

	// Case 4: Rate > 100 or negative or NaN -> Rejected, no reward
	topUp2 := &TopUp{Id: 556, UserId: 201, Amount: 10, TradeNo: "trade-556", Status: common.TopUpStatusSuccess}
	require.NoError(t, DB.Create(topUp2).Error)
	common.AffiliateCommissionRate = 120.0
	processTopUpAffiliateReward(topUp2, 100000)
	common.AffiliateCommissionRate = -10.0
	processTopUpAffiliateReward(topUp2, 100000)
	require.NoError(t, DB.First(&checkUser, 200).Error)
	assert.Equal(t, 70000, checkUser.AffQuota) // Unchanged
}

func TestValidateAffiliateCommissionRateOption(t *testing.T) {
	// Valid rates
	assert.NoError(t, validateOptionValue("AffiliateCommissionRate", "0"))
	assert.NoError(t, validateOptionValue("AffiliateCommissionRate", "7.5"))
	assert.NoError(t, validateOptionValue("AffiliateCommissionRate", "100"))
	assert.NoError(t, validateOptionValue("AffiliateCommissionRate", " 50 "))

	// Invalid rates
	assert.Error(t, validateOptionValue("AffiliateCommissionRate", "-1"))
	assert.Error(t, validateOptionValue("AffiliateCommissionRate", "100.01"))
	assert.Error(t, validateOptionValue("AffiliateCommissionRate", "abc"))
	assert.Error(t, validateOptionValue("AffiliateCommissionRate", "NaN"))
	assert.Error(t, validateOptionValue("AffiliateCommissionRate", "+Inf"))
}

func TestTopUpCalculateQuota(t *testing.T) {
	// 1. Epay default: Amount * QuotaPerUnit
	topUpEpay := &TopUp{PaymentProvider: PaymentProviderEpay, Amount: 10}
	q, err := topUpEpay.CalculateQuota()
	require.NoError(t, err)
	assert.Equal(t, int(10*common.QuotaPerUnit), q)

	// 2. Stripe: Money * QuotaPerUnit
	topUpStripe := &TopUp{PaymentProvider: PaymentProviderStripe, Money: 15.5}
	q, err = topUpStripe.CalculateQuota()
	require.NoError(t, err)
	assert.Equal(t, int(15.5*common.QuotaPerUnit), q)

	// 3. Creem: direct Amount
	topUpCreem := &TopUp{PaymentProvider: PaymentProviderCreem, Amount: 250000}
	q, err = topUpCreem.CalculateQuota()
	require.NoError(t, err)
	assert.Equal(t, 250000, q)
}

func TestRechargeEpayAlreadyDoneRetryIssuesReward(t *testing.T) {
	setupUserUpdateTestState(t)

	oldRate := common.AffiliateCommissionRate
	defer func() {
		common.AffiliateCommissionRate = oldRate
	}()
	common.AffiliateCommissionRate = 10.0 // 10%

	// Create inviter and invitee
	inviter := User{
		Id:              300,
		Username:        "inviter300",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-300",
		AffQuota:        0,
		AffHistoryQuota: 0,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	invitee := User{
		Id:        301,
		Username:  "invitee301",
		Password:  "password",
		Role:      common.RoleCommonUser,
		Status:    common.UserStatusEnabled,
		AffCode:   "aff-invitee-301",
		InviterId: 300,
	}
	require.NoError(t, DB.Create(&invitee).Error)

	// Simulate an existing topup that succeeded previously, but affiliate reward was NOT granted yet (e.g. initial failure)
	topUp := &TopUp{
		Id:              777,
		UserId:          301,
		Amount:          20, // 20 USD = 20 * 500000 = 10,000,000 quota
		TradeNo:         "epay-retry-test-777",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, DB.Create(topUp).Error)

	// First retry callback arrives: alreadyDone should be true, AND affiliate reward should be granted!
	alreadyDone, err := RechargeEpay("epay-retry-test-777", "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)

	// Verify inviter received 10% of 10,000,000 = 1,000,000 quota
	var checkUser User
	require.NoError(t, DB.First(&checkUser, 300).Error)
	assert.Equal(t, 1000000, checkUser.AffQuota)
	assert.Equal(t, 1000000, checkUser.AffHistoryQuota)

	// Verify admin_info was attached to the system log
	var rewardLog Log
	require.NoError(t, LOG_DB.Where("user_id = ? AND type = ?", 300, LogTypeSystem).Order("id desc").First(&rewardLog).Error)
	assert.Contains(t, rewardLog.Other, "admin_info")
	assert.Contains(t, rewardLog.Other, "topup_id")

	// Second retry callback arrives: alreadyDone should be true, but NO duplicate reward
	alreadyDone2, err2 := RechargeEpay("epay-retry-test-777", "alipay", "127.0.0.1")
	require.NoError(t, err2)
	assert.True(t, alreadyDone2)

	require.NoError(t, DB.First(&checkUser, 300).Error)
	assert.Equal(t, 1000000, checkUser.AffQuota) // Remains 1,000,000
}

func TestProcessTopUpAffiliateRewardQuotaSaturationLogged(t *testing.T) {
	setupUserUpdateTestState(t)

	oldRate := common.AffiliateCommissionRate
	defer func() {
		common.AffiliateCommissionRate = oldRate
	}()
	common.AffiliateCommissionRate = 100.0 // 100%

	inviter := User{
		Id:              400,
		Username:        "inviter400",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-400",
		AffQuota:        0,
		AffHistoryQuota: 0,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	invitee := User{
		Id:        401,
		Username:  "invitee401",
		Password:  "password",
		Role:      common.RoleCommonUser,
		Status:    common.UserStatusEnabled,
		AffCode:   "aff-invitee-401",
		InviterId: 400,
	}
	require.NoError(t, DB.Create(&invitee).Error)

	topUp := &TopUp{
		Id:              888,
		UserId:          401,
		Amount:          10000, // 10000 USD
		TradeNo:         "epay-saturation-test-888",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, DB.Create(topUp).Error)

	// creditedQuota exceeds math.MaxInt32 (e.g. 5,000,000,000)
	hugeQuota := 5000000000
	processTopUpAffiliateReward(topUp, hugeQuota)

	// Verify reward was clamped to common.MaxQuota (math.MaxInt32)
	var checkUser User
	require.NoError(t, DB.First(&checkUser, 400).Error)
	assert.Equal(t, common.MaxQuota, checkUser.AffQuota)

	// Verify system log has admin_info with quota_saturation marker
	var rewardLog Log
	require.NoError(t, LOG_DB.Where("user_id = ? AND type = ?", 400, LogTypeSystem).Order("id desc").First(&rewardLog).Error)
	assert.Contains(t, rewardLog.Other, "admin_info")
	assert.Contains(t, rewardLog.Other, "quota_saturation")
	assert.Contains(t, rewardLog.Other, "overflow")
}

func TestCreateAffiliateRewardTxRollback(t *testing.T) {
	setupUserUpdateTestState(t)

	inviter := User{
		Id:              500,
		Username:        "inviter500",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-500",
		AffQuota:        1000,
		AffHistoryQuota: 1000,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	// In a transaction that rolls back, aff_quota must not change and no record created
	txErr := DB.Transaction(func(tx *gorm.DB) error {
		err := CreateAffiliateRewardTx(tx, "tx-rollback-1", 500, 300)
		require.NoError(t, err)
		return errors.New("simulated business rollback")
	})
	require.Error(t, txErr)

	var checkUser User
	require.NoError(t, DB.First(&checkUser, 500).Error)
	assert.Equal(t, 1000, checkUser.AffQuota)
	assert.Equal(t, 1000, checkUser.AffHistoryQuota)

	var count int64
	require.NoError(t, DB.Model(&AffiliateReward{}).Where("reference = ?", "tx-rollback-1").Count(&count).Error)
	assert.Zero(t, count)
}

func TestRechargeEpayAffiliateRewardTransactionAtomicity(t *testing.T) {
	setupUserUpdateTestState(t)

	oldRate := common.AffiliateCommissionRate
	defer func() {
		common.AffiliateCommissionRate = oldRate
	}()
	common.AffiliateCommissionRate = 10.0 // 10%

	inviter := User{
		Id:              600,
		Username:        "inviter600",
		Password:        "password",
		Role:            common.RoleCommonUser,
		Status:          common.UserStatusEnabled,
		AffCode:         "aff-inviter-600",
		AffQuota:        0,
		AffHistoryQuota: 0,
	}
	require.NoError(t, DB.Create(&inviter).Error)

	invitee := User{
		Id:        601,
		Username:  "invitee601",
		Password:  "password",
		Role:      common.RoleCommonUser,
		Status:    common.UserStatusEnabled,
		AffCode:   "aff-invitee-601",
		InviterId: 600,
		Quota:     5000,
	}
	require.NoError(t, DB.Create(&invitee).Error)

	topUp := &TopUp{
		Id:              999,
		UserId:          601,
		Amount:          10, // 10 USD = 5,000,000 quota
		TradeNo:         "epay-atomicity-test-999",
		PaymentMethod:   "alipay",
		PaymentProvider: PaymentProviderEpay,
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, DB.Create(topUp).Error)

	// Inject a failure specifically when inserting into affiliate_rewards
	callbackName := "test:fail_affiliate_rewards_create"
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "affiliate_rewards" {
			tx.AddError(errors.New("simulated affiliate reward database failure"))
		}
	}))

	// Attempt recharge: should fail because affiliate reward settlement fails in-transaction
	alreadyDone, err := RechargeEpay("epay-atomicity-test-999", "alipay", "127.0.0.1")
	require.Error(t, err)
	assert.False(t, alreadyDone)

	// Clean up callback
	require.NoError(t, DB.Callback().Create().Remove(callbackName))

	// Verify atomicity: entire transaction rolled back!
	// 1. Order status is still Pending
	var checkTopUp TopUp
	require.NoError(t, DB.First(&checkTopUp, 999).Error)
	assert.Equal(t, common.TopUpStatusPending, checkTopUp.Status)

	// 2. Invitee quota did NOT increase
	var checkInvitee User
	require.NoError(t, DB.First(&checkInvitee, 601).Error)
	assert.Equal(t, 5000, checkInvitee.Quota)

	// 3. Inviter aff_quota did NOT increase
	var checkInviter User
	require.NoError(t, DB.First(&checkInviter, 600).Error)
	assert.Equal(t, 0, checkInviter.AffQuota)
	assert.Equal(t, 0, checkInviter.AffHistoryQuota)

	// 4. No AffiliateReward row exists
	var affCount int64
	require.NoError(t, DB.Model(&AffiliateReward{}).Where("reference = ?", "topup-999").Count(&affCount).Error)
	assert.Zero(t, affCount)

	// Now retry the callback after the simulated transient DB issue resolved:
	alreadyDone, err = RechargeEpay("epay-atomicity-test-999", "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)

	// Verify everything committed together atomically!
	require.NoError(t, DB.First(&checkTopUp, 999).Error)
	assert.Equal(t, common.TopUpStatusSuccess, checkTopUp.Status)

	require.NoError(t, DB.First(&checkInvitee, 601).Error)
	assert.Equal(t, 5000+10*int(common.QuotaPerUnit), checkInvitee.Quota)

	require.NoError(t, DB.First(&checkInviter, 600).Error)
	assert.Equal(t, int(float64(10*common.QuotaPerUnit)*0.1), checkInviter.AffQuota)
	assert.Equal(t, int(float64(10*common.QuotaPerUnit)*0.1), checkInviter.AffHistoryQuota)

	require.NoError(t, DB.Model(&AffiliateReward{}).Where("reference = ?", "topup-999").Count(&affCount).Error)
	assert.EqualValues(t, 1, affCount)
}


