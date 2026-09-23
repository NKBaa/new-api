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
package service

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

var (
	urlPattern  = regexp.MustCompile(`https?://[^\s'"<]+`)
	ipPattern   = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b`)
	jsonPattern = regexp.MustCompile(`(?s)\{.*"error".*\}`)

	cachedRulesJSON string
	cachedRules     []common.ErrorMappingRule
	rulesMutex      sync.RWMutex
)

// DefaultErrorMappingRules returns the pre-seeded rules covering common upstream errors
// including all 11 user-specified production error scenarios.
func DefaultErrorMappingRules() []common.ErrorMappingRule {
	return []common.ErrorMappingRule{
		{
			Id:           1,
			Name:         "Embeddings API 不支持",
			MatchCode:    0,
			Keywords:     "Embeddings API is not supported, not supported for this platform",
			ReplaceMsg:   "当前模型不支持 Embeddings 操作，请检查所选模型。",
			OverrideCode: http.StatusBadRequest,
			Enabled:      true,
		},
		{
			Id:           2,
			Name:         "输入或生成敏感内容拦截",
			MatchCode:    0,
			Keywords:     "不安全或敏感内容, 易产生敏感内容的提示语, sensitive content, content_filter, prompt was filtered",
			ReplaceMsg:   "输入或生成内容触发安全合规策略，请调整提示词后重试。",
			OverrideCode: http.StatusBadRequest,
			Enabled:      true,
		},
		{
			Id:           3,
			Name:         "上游模型高负载或饱和",
			MatchCode:    0,
			Keywords:     "currently experiencing high demand, spikes in demand, 当前分组负载已饱和, 负载已饱和, high traffic",
			ReplaceMsg:   "当前模型服务请求量激增或高负载，请稍后重试。",
			OverrideCode: http.StatusServiceUnavailable,
			Enabled:      true,
		},
		{
			Id:           4,
			Name:         "上游账户或组织不存在",
			MatchCode:    0,
			Keywords:     "User does not exist, organization does not exist",
			ReplaceMsg:   "上游服务认证异常或账户不可用，请联系管理员。",
			OverrideCode: http.StatusBadGateway,
			Enabled:      true,
		},
		{
			Id:           5,
			Name:         "分组内无可用模型渠道",
			MatchCode:    0,
			Keywords:     "not supported by any configured account in this group, no available channel",
			ReplaceMsg:   "当前分组暂无支持该模型的可用渠道，请检查模型名称或更换分组。",
			OverrideCode: http.StatusNotFound,
			Enabled:      true,
		},
		{
			Id:           6,
			Name:         "上游服务暂时不可用",
			MatchCode:    http.StatusServiceUnavailable,
			Keywords:     "Service temporarily unavailable, temporarily unavailable, service unavailable",
			ReplaceMsg:   "上游服务暂时不可用，请稍后重试。",
			OverrideCode: http.StatusServiceUnavailable,
			Enabled:      true,
		},
		{
			Id:           7,
			Name:         "模型或资源未找到",
			MatchCode:    http.StatusNotFound,
			Keywords:     "Requested entity was not found, NOT_FOUND, model_not_found",
			ReplaceMsg:   "请求的模型或上游资源未找到，请核对模型配置。",
			OverrideCode: http.StatusNotFound,
			Enabled:      true,
		},
		{
			Id:           8,
			Name:         "上游配额耗尽或超频",
			MatchCode:    0,
			Keywords:     "exceeded your current quota, Quota exceeded, Resource has been exhausted, free_tier_reque, rate limit, quota",
			ReplaceMsg:   "上游渠道配额已耗尽或超出调用频率限制，请稍后重试。",
			OverrideCode: http.StatusTooManyRequests,
			Enabled:      true,
		},
		{
			Id:           9,
			Name:         "上下文长度超出模型限制",
			MatchCode:    http.StatusBadRequest,
			Keywords:     "context_length_exceeded, maximum context length, token count exceeds, prompt too long",
			ReplaceMsg:   "提示词长度超出该模型上下文上限，请精简输入后重试。",
			OverrideCode: http.StatusBadRequest,
			Enabled:      true,
		},
		{
			Id:           10,
			Name:         "上游认证凭据失效",
			MatchCode:    http.StatusUnauthorized,
			Keywords:     "invalid_api_key, incorrect api key, unauthorized, authentication failed",
			ReplaceMsg:   "上游服务认证凭据已失效，请联系管理员处理。",
			OverrideCode: http.StatusBadGateway,
			Enabled:      true,
		},
	}
}

func DefaultErrorMappingRulesJSON() string {
	bytes, _ := common.Marshal(DefaultErrorMappingRules())
	return string(bytes)
}

func GetEffectiveErrorMappingRules() []common.ErrorMappingRule {
	rulesMutex.RLock()
	rawJSON := common.ErrorMappingRules
	if rawJSON == cachedRulesJSON && cachedRules != nil {
		defer rulesMutex.RUnlock()
		return cachedRules
	}
	rulesMutex.RUnlock()

	rulesMutex.Lock()
	defer rulesMutex.Unlock()
	if rawJSON == cachedRulesJSON && cachedRules != nil {
		return cachedRules
	}

	trimmed := strings.TrimSpace(rawJSON)
	if trimmed == "" || trimmed == "[]" {
		cachedRules = DefaultErrorMappingRules()
		cachedRulesJSON = rawJSON
		return cachedRules
	}

	var parsed []common.ErrorMappingRule
	if err := common.Unmarshal([]byte(trimmed), &parsed); err != nil || len(parsed) == 0 {
		cachedRules = DefaultErrorMappingRules()
		cachedRulesJSON = rawJSON
		return cachedRules
	}

	cachedRules = parsed
	cachedRulesJSON = rawJSON
	return cachedRules
}

// SplitKeywords splits comma or newline separated keywords
func SplitKeywords(keywords string) []string {
	var result []string
	normalized := strings.ReplaceAll(keywords, "，", ",")
	normalized = strings.ReplaceAll(normalized, "\r\n", ",")
	normalized = strings.ReplaceAll(normalized, "\n", ",")
	parts := strings.Split(normalized, ",")
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}

// MatchErrorRule checks if statusCode and rawMsg match any active error mapping rule.
// Returns (replaceMsg, overrideCode, true) if matched, or ("", 0, false) if no rule matched.
func MatchErrorRule(statusCode int, rawMsg string) (string, int, bool) {
	rules := GetEffectiveErrorMappingRules()
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		if rule.MatchCode > 0 && rule.MatchCode != statusCode {
			continue
		}
		keywords := SplitKeywords(rule.Keywords)
		if len(keywords) == 0 {
			if rule.MatchCode > 0 && rule.MatchCode == statusCode {
				return rule.ReplaceMsg, rule.OverrideCode, true
			}
			continue
		}
		lowerMsg := strings.ToLower(rawMsg)
		matched := false
		for _, kw := range keywords {
			if strings.Contains(lowerMsg, strings.ToLower(kw)) {
				matched = true
				break
			}
		}
		if matched {
			return rule.ReplaceMsg, rule.OverrideCode, true
		}
	}
	return "", 0, false
}

// ClassifySmartFallback generates a safe, standardized fallback message based on HTTP status code and message patterns.
// It guarantees that raw upstream technical strings (internal model names, deployment IDs, supplier details)
// are never leaked to regular clients when no custom mapping rule matches.
func ClassifySmartFallback(statusCode int, rawMsg string) string {
	lowerMsg := strings.ToLower(rawMsg)

	switch statusCode {
	case http.StatusTooManyRequests: // 429
		return "上游服务请求过多或配额超限，请稍后重试。"
	case http.StatusServiceUnavailable, http.StatusBadGateway, http.StatusGatewayTimeout: // 503, 502, 504
		return "上游服务暂时不可用或网络异常，请稍后重试。"
	case http.StatusNotFound: // 404
		return "请求的模型或上游资源不存在，请核对配置。"
	case http.StatusUnauthorized, http.StatusForbidden: // 401, 403
		return "上游渠道认证失败或未授权访问，请联系管理员。"
	case http.StatusRequestEntityTooLarge: // 413
		return "请求数据过大，超出模型单次处理上限，请精简输入。"
	case http.StatusUnprocessableEntity: // 422
		return "请求参数语义校验失败，请检查请求内容。"
	case http.StatusBadRequest: // 400
		if strings.Contains(lowerMsg, "context") || strings.Contains(lowerMsg, "token") || strings.Contains(lowerMsg, "length") || strings.Contains(lowerMsg, "max_tokens") {
			return "提示词长度超出模型限制，请缩减输入。"
		} else if strings.Contains(lowerMsg, "sensitive") || strings.Contains(lowerMsg, "safety") || strings.Contains(lowerMsg, "harmful") || strings.Contains(lowerMsg, "moderation") || strings.Contains(lowerMsg, "blocked") {
			return "输入内容触发上游安全合规策略，请调整后重试。"
		} else if strings.Contains(lowerMsg, "image") || strings.Contains(lowerMsg, "audio") || strings.Contains(lowerMsg, "video") || strings.Contains(lowerMsg, "media") || strings.Contains(lowerMsg, "multimodal") {
			return "多模态媒体格式不符合模型要求，请核对后重试。"
		} else if strings.Contains(lowerMsg, "tool") || strings.Contains(lowerMsg, "function") {
			return "当前模型不支持或不兼容所调用的工具配置，请核对请求参数。"
		} else {
			return "请求参数无效或不被上游模型支持，请检查请求配置。"
		}
	case http.StatusInternalServerError: // 500
		return "上游渠道内部服务异常，请稍后重试。"
	default:
		if statusCode >= 500 {
			return "上游渠道内部服务异常，请稍后重试。"
		} else if statusCode >= 400 {
			return "请求参数或状态异常，请核对后重试。"
		}
		return "上游服务调用异常，请稍后重试。"
	}
}

// ExtractStatusCodeAndMessage parses strings like "status_code=500, User does not exist..."
// into (500, "User does not exist..."). If no status_code prefix exists, returns (0, content).
func ExtractStatusCodeAndMessage(content string) (int, string) {
	statusCode := 0
	msg := strings.TrimSpace(content)
	if strings.HasPrefix(msg, "status_code=") {
		parts := strings.SplitN(msg, ", ", 2)
		if len(parts) >= 1 {
			codePart := strings.TrimPrefix(parts[0], "status_code=")
			if code, err := strconv.Atoi(codePart); err == nil {
				statusCode = code
			}
		}
		if len(parts) == 2 {
			msg = parts[1]
		} else {
			msg = ""
		}
	}
	return statusCode, strings.TrimSpace(msg)
}

// SanitizeLogContent sanitizes a raw error log content string for regular users.
func SanitizeLogContent(content string) string {
	if !common.ErrorSanitizationEnabled || strings.TrimSpace(content) == "" {
		return content
	}

	statusCode, rawMsg := ExtractStatusCodeAndMessage(content)

	if replaceMsg, _, matched := MatchErrorRule(statusCode, rawMsg); matched {
		return replaceMsg
	}

	return ClassifySmartFallback(statusCode, rawMsg)
}

// SanitizeUserLogs sanitizes error log contents for regular user consumption,
// ensuring users see friendly sanitized error messages in the web console without technical leaks.
func SanitizeUserLogs(logs []*model.Log) {
	if !common.ErrorSanitizationEnabled || len(logs) == 0 {
		return
	}
	for _, l := range logs {
		if l.Type == model.LogTypeError && l.Content != "" {
			l.Content = SanitizeLogContent(l.Content)
		}
	}
}

// SanitizeRelayError matches the error against configured rules and fallback classifier.
// It modifies err in-place so that serialization (OpenAI, Claude, etc.) receives the sanitized message
// and standardizes Type, Code, Param, and Metadata to completely prevent upstream leaks.
func SanitizeRelayError(c *gin.Context, err *types.NewAPIError) {
	if err == nil || !common.ErrorSanitizationEnabled {
		return
	}

	rawMsg := err.Error()
	statusCode := err.StatusCode

	replaceMsg, overrideCode, matched := MatchErrorRule(statusCode, rawMsg)
	if matched {
		if overrideCode > 0 {
			err.StatusCode = overrideCode
			statusCode = overrideCode
		}
	} else {
		replaceMsg = ClassifySmartFallback(statusCode, rawMsg)
	}

	err.SetMessage(replaceMsg)
	err.SanitizeFields(statusCode)
}

func sanitizeTechnicalDetails(msg string) string {
	cleaned := urlPattern.ReplaceAllString(msg, "[链接]")
	cleaned = ipPattern.ReplaceAllString(cleaned, "[IP]")
	cleaned = jsonPattern.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)
	if strings.HasPrefix(cleaned, "status_code=") {
		parts := strings.SplitN(cleaned, ", ", 2)
		if len(parts) == 2 {
			cleaned = parts[1]
		}
	}
	return strings.TrimSpace(cleaned)
}
