/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package common

import (
	"fmt"
	"strings"
)

type ErrorMappingRule struct {
	Id           int    `json:"id"`
	Name         string `json:"name"`
	MatchCode    int    `json:"match_code"`    // 0 = any status code
	Keywords     string `json:"keywords"`      // comma or newline separated keywords
	ReplaceMsg   string `json:"replace_msg"`   // User-facing sanitized explanation
	OverrideCode int    `json:"override_code"` // 0 = retain upstream status code
	Enabled      bool   `json:"enabled"`
	// MessageKey 仅由内置预设规则使用，用于按请求语言下发文案；
	// 自定义规则留空，此时直接输出 ReplaceMsg（保持站长原文）。
	MessageKey string `json:"message_key,omitempty"`
}

// ValidateErrorMappingRules rejects enabled rules that can match the same
// message under the same status-code scope. Matching remains deterministic and
// configuration errors are reported before the option is persisted.
func ValidateErrorMappingRules(rules []ErrorMappingRule) error {
	for i := range rules {
		if !rules[i].Enabled {
			continue
		}
		leftKeywords := splitErrorRuleKeywords(rules[i].Keywords)
		for j := i + 1; j < len(rules); j++ {
			if !rules[j].Enabled || !errorRuleStatusScopesOverlap(rules[i].MatchCode, rules[j].MatchCode) {
				continue
			}
			rightKeywords := splitErrorRuleKeywords(rules[j].Keywords)
			if len(leftKeywords) == 0 || len(rightKeywords) == 0 {
				return fmt.Errorf("启用的报错映射规则 %q 与 %q 可能同时命中，请限定状态码或关键词", rules[i].Name, rules[j].Name)
			}
			for _, left := range leftKeywords {
				for _, right := range rightKeywords {
					if strings.Contains(left, right) || strings.Contains(right, left) {
						return fmt.Errorf("启用的报错映射规则 %q 与 %q 的关键词存在重叠：%q / %q", rules[i].Name, rules[j].Name, left, right)
					}
				}
			}
		}
	}
	return nil
}

func splitErrorRuleKeywords(raw string) []string {
	normalized := strings.NewReplacer("，", ",", "\r\n", ",", "\n", ",").Replace(raw)
	parts := strings.Split(normalized, ",")
	keywords := make([]string, 0, len(parts))
	for _, part := range parts {
		if keyword := strings.ToLower(strings.TrimSpace(part)); keyword != "" {
			keywords = append(keywords, keyword)
		}
	}
	return keywords
}

func errorRuleStatusScopesOverlap(left, right int) bool {
	return left == 0 || right == 0 || left == right
}
