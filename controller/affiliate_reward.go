package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AffiliateRewardRequest struct {
	Reference   string `json:"reference"`
	UserID      int    `json:"user_id"`
	RewardQuota int    `json:"reward_quota"`
}

// AddAffiliateReward is intentionally narrow: external services may only add
// invitation quota/history. Registration counts, inviter relationships and
// ordinary quota remain owned by the native New API flows.
func AddAffiliateReward(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req AffiliateRewardRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	req.Reference = strings.TrimSpace(req.Reference)
	if req.Reference == "" || len(req.Reference) > 160 || req.UserID <= 0 || req.RewardQuota <= 0 || req.RewardQuota > common.MaxWalletQuota {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid affiliate reward"})
		return
	}

	alreadyApplied, err := model.CreateAffiliateReward(req.Reference, req.UserID, req.RewardQuota)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "user not found"})
		case errors.Is(err, model.ErrAffiliateRewardReferenceConflict):
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "reward reference conflict"})
		case errors.Is(err, model.ErrAffiliateRewardQuotaLimit):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "affiliate quota limit exceeded"})
		default:
			common.SysError("affiliate reward failed: " + err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "database error"})
		}
		return
	}

	if !alreadyApplied {
		model.RecordLog(req.UserID, model.LogTypeSystem, fmt.Sprintf("邀请用户充值奖励，增加邀请额度: %s", logger.LogQuota(req.RewardQuota)))
	}
	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"already_applied": alreadyApplied,
		"data": gin.H{
			"reference":    req.Reference,
			"user_id":      req.UserID,
			"reward_quota": req.RewardQuota,
		},
	})
}
