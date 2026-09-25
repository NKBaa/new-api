package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrAffiliateRewardAlreadyProcessed = errors.New("affiliate reward already processed")
	ErrInvalidAffiliateReward          = errors.New("invalid affiliate reward parameters")
)

type AffiliateReward struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Reference   string `json:"reference" gorm:"type:varchar(160);uniqueIndex;not null"`
	UserId      int    `json:"user_id" gorm:"index;not null"`
	RewardQuota int    `json:"reward_quota" gorm:"not null"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;autoCreateTime;column:created_at"`
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "unique constraint") ||
		strings.Contains(errStr, "duplicate entry") ||
		strings.Contains(errStr, "duplicate key") ||
		strings.Contains(errStr, "23505") ||
		strings.Contains(errStr, "1062")
}

// CreateAffiliateRewardTx 幂等入账返佣奖励（在已有事务 tx 中执行）。
func CreateAffiliateRewardTx(tx *gorm.DB, reference string, userId int, rewardQuota int) error {
	if tx == nil {
		return errors.New("nil transaction")
	}
	if reference == "" || userId <= 0 || rewardQuota <= 0 {
		return ErrInvalidAffiliateReward
	}

	var existing AffiliateReward
	if err := tx.Where("reference = ?", reference).First(&existing).Error; err == nil {
		return ErrAffiliateRewardAlreadyProcessed
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	reward := AffiliateReward{
		Reference:   reference,
		UserId:      userId,
		RewardQuota: rewardQuota,
		CreatedAt:   common.GetTimestamp(),
	}
	if err := tx.Create(&reward).Error; err != nil {
		if isUniqueConstraintError(err) {
			return ErrAffiliateRewardAlreadyProcessed
		}
		return err
	}

	res := tx.Model(&User{}).Where("id = ?", userId).Updates(map[string]any{
		"aff_quota":   gorm.Expr("aff_quota + ?", rewardQuota),
		"aff_history": gorm.Expr("aff_history + ?", rewardQuota),
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}
