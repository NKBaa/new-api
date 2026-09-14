package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AffiliateReward is the idempotency ledger for external affiliate rewards.
// It contains only runtime facts; configuration stays outside the database.
type AffiliateReward struct {
	ID          uint   `gorm:"primaryKey"`
	Reference   string `gorm:"type:varchar(160);uniqueIndex;not null"`
	UserID      int    `gorm:"index;not null"`
	RewardQuota int    `gorm:"not null"`
	CreatedAt   int64  `gorm:"autoCreateTime"`
}

var ErrAffiliateRewardReferenceConflict = errors.New("affiliate reward reference conflict")
var ErrAffiliateRewardQuotaLimit = errors.New("affiliate reward quota limit exceeded")

// CreateAffiliateReward applies a reward exactly once for a reference.
// The unique reference and user row lock make retries safe across instances.
func CreateAffiliateReward(reference string, userID int, rewardQuota int) (alreadyApplied bool, err error) {
	if reference == "" || userID <= 0 || rewardQuota <= 0 {
		return false, errors.New("invalid affiliate reward")
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var existing AffiliateReward
		if err := tx.Where("reference = ?", reference).First(&existing).Error; err == nil {
			if existing.UserID != userID || existing.RewardQuota != rewardQuota {
				return ErrAffiliateRewardReferenceConflict
			}
			alreadyApplied = true
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var user User
		if err := lockForUpdate(tx).Select("id", "aff_quota", "aff_history").First(&user, userID).Error; err != nil {
			return err
		}
		if user.AffQuota > common.MaxWalletQuota-rewardQuota || user.AffHistoryQuota > common.MaxWalletQuota-rewardQuota {
			return ErrAffiliateRewardQuotaLimit
		}
		// Serialize concurrent requests for the same invitee, then re-check
		// the reference after waiting for the first transaction to commit.
		if err := tx.Where("reference = ?", reference).First(&existing).Error; err == nil {
			if existing.UserID != userID || existing.RewardQuota != rewardQuota {
				return ErrAffiliateRewardReferenceConflict
			}
			alreadyApplied = true
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := tx.Create(&AffiliateReward{
			Reference:   reference,
			UserID:      userID,
			RewardQuota: rewardQuota,
		}).Error; err != nil {
			// Do not query after a duplicate-key error: PostgreSQL marks the
			// transaction aborted. The next retry resolves the reference.
			return err
		}
		return tx.Model(&User{}).Where("id = ?", userID).Updates(map[string]any{
			"aff_quota":   gorm.Expr("aff_quota + ?", rewardQuota),
			"aff_history": gorm.Expr("aff_history + ?", rewardQuota),
		}).Error
	})
	return alreadyApplied, err
}
