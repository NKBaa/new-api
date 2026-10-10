package console_setting

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/QuantumNous/new-api/common"
)

var (
	urlRegex       = regexp.MustCompile(`^https?://(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?:\:[0-9]{1,5})?(?:/.*)?$`)
	dangerousChars = []string{"<script", "<iframe", "javascript:", "onload=", "onerror=", "onclick="}
	validColors    = map[string]bool{
		"blue": true, "green": true, "cyan": true, "purple": true, "pink": true,
		"red": true, "orange": true, "amber": true, "yellow": true, "lime": true,
		"light-green": true, "teal": true, "light-blue": true, "indigo": true,
		"violet": true, "grey": true, "slate": true,
	}
	slugRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

func parseJSONArray(jsonStr string, formatErrorKey string) ([]map[string]any, error) {
	var list []map[string]any
	if err := common.UnmarshalJsonStr(jsonStr, &list); err != nil {
		return nil, common.NewMessage(formatErrorKey, map[string]any{"error": err.Error()})
	}
	return list, nil
}

func exceedsMaxCharacters(s string, max int) bool {
	return len(utf16.Encode([]rune(s))) > max
}

// itemMessages are the keys of the URL and content checks shared by the
// API info and Uptime Kuma group lists.
type itemMessages struct {
	invalidURL    string
	unparsableURL string
	unsafeContent string
}

var (
	apiInfoMessages = itemMessages{
		invalidURL:    "API info #{{index}} has an invalid URL format",
		unparsableURL: "API info #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "API info #{{index}} contains disallowed content",
	}
	groupMessages = itemMessages{
		invalidURL:    "Group #{{index}} has an invalid URL format",
		unparsableURL: "Group #{{index}} has a URL that cannot be parsed: {{error}}",
		unsafeContent: "Group #{{index}} contains disallowed content",
	}
)

func validateURL(urlStr string, index int, messages itemMessages) error {
	if !urlRegex.MatchString(urlStr) {
		return common.NewMessage(messages.invalidURL, map[string]any{"index": index})
	}
	if _, err := url.Parse(urlStr); err != nil {
		return common.NewMessage(messages.unparsableURL, map[string]any{"index": index, "error": err.Error()})
	}
	return nil
}

func checkDangerousContent(content string, index int, messages itemMessages) error {
	lower := strings.ToLower(content)
	for _, d := range dangerousChars {
		if strings.Contains(lower, d) {
			return common.NewMessage(messages.unsafeContent, map[string]any{"index": index})
		}
	}
	return nil
}

func checkCustomerServiceDangerousContent(content string, index int, field string) error {
	lower := strings.ToLower(content)
	for _, d := range dangerousChars {
		if strings.Contains(lower, d) {
			return fmt.Errorf("第%d个%s包含不允许的内容", index, field)
		}
	}
	return nil
}

func validateCustomerServiceURL(value string, index int, field string) error {
	if !urlRegex.MatchString(value) {
		return fmt.Errorf("第%d个%s格式无效", index, field)
	}
	if _, err := url.Parse(value); err != nil {
		return fmt.Errorf("第%d个%s无法解析: %v", index, field, err)
	}
	return nil
}

func validateDataURLImage(dataURL string, index int, itemType string, allowIco bool) error {
	lower := strings.ToLower(dataURL)
	if strings.HasPrefix(lower, "data:image/svg") || strings.Contains(lower, "image/svg+xml") {
		return fmt.Errorf("第%d个%s不允许使用SVG格式图片", index, itemType)
	}

	validPrefixes := []string{
		"data:image/png;base64,",
		"data:image/jpeg;base64,",
		"data:image/jpg;base64,",
		"data:image/webp;base64,",
		"data:image/gif;base64,",
	}
	if allowIco {
		validPrefixes = append(validPrefixes, "data:image/x-icon;base64,", "data:image/vnd.microsoft.icon;base64,")
	}

	matchedPrefix := ""
	for _, p := range validPrefixes {
		if strings.HasPrefix(lower, p) {
			matchedPrefix = p
			break
		}
	}
	if matchedPrefix == "" {
		return fmt.Errorf("第%d个%s的图片格式不受支持或缺少base64编码", index, itemType)
	}

	rawB64 := dataURL[len(matchedPrefix):]
	decoded, err := base64.StdEncoding.DecodeString(rawB64)
	if err != nil {
		return fmt.Errorf("第%d个%s的base64数据无法解析", index, itemType)
	}

	decodedLower := strings.ToLower(string(decoded))
	for _, d := range dangerousChars {
		if strings.Contains(decodedLower, d) {
			return fmt.Errorf("第%d个%s的图片内容包含危险脚本", index, itemType)
		}
	}
	if strings.Contains(decodedLower, "<svg") || strings.Contains(decodedLower, "<?xml") {
		return fmt.Errorf("第%d个%s包含被禁止的SVG矢量数据", index, itemType)
	}

	return nil
}

func getJSONList(jsonStr string) []map[string]any {
	if jsonStr == "" {
		return []map[string]any{}
	}
	var list []map[string]any
	_ = common.UnmarshalJsonStr(jsonStr, &list)
	return list
}

func ValidateConsoleSettings(settingsStr string, settingType string) error {
	if settingsStr == "" {
		return nil
	}

	switch settingType {
	case "ApiInfo":
		return validateApiInfo(settingsStr)
	case "Announcements":
		return validateAnnouncements(settingsStr)
	case "FAQ":
		return validateFAQ(settingsStr)
	case "UptimeKumaGroups":
		return validateUptimeKumaGroups(settingsStr)
	case "CustomerService":
		return validateCustomerService(settingsStr)
	default:
		return common.NewMessage("Unknown setting type: {{type}}", map[string]any{"type": settingType})
	}
}

func validateApiInfo(apiInfoStr string) error {
	apiInfoList, err := parseJSONArray(apiInfoStr, "Invalid API info format: {{error}}")
	if err != nil {
		return err
	}

	if len(apiInfoList) > 50 {
		return common.NewMessage("API info cannot exceed 50 entries")
	}

	for i, apiInfo := range apiInfoList {
		urlStr, ok := apiInfo["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("API info #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		route, ok := apiInfo["route"].(string)
		if !ok || route == "" {
			return common.NewMessage("API info #{{index}} is missing the route description field", map[string]any{"index": i + 1})
		}
		description, ok := apiInfo["description"].(string)
		if !ok || description == "" {
			return common.NewMessage("API info #{{index}} is missing the description field", map[string]any{"index": i + 1})
		}
		color, ok := apiInfo["color"].(string)
		if !ok || color == "" {
			return common.NewMessage("API info #{{index}} is missing the color field", map[string]any{"index": i + 1})
		}

		if err := validateURL(urlStr, i+1, apiInfoMessages); err != nil {
			return err
		}

		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("API info #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(route, 100) {
			return common.NewMessage("API info #{{index}} route description cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("API info #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !validColors[color] {
			return common.NewMessage("API info #{{index}} has an invalid color value", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, apiInfoMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(route, i+1, apiInfoMessages); err != nil {
			return err
		}
	}
	return nil
}

func GetApiInfo() []map[string]any {
	return getJSONList(GetConsoleSetting().ApiInfo)
}

func validateAnnouncements(announcementsStr string) error {
	list, err := parseJSONArray(announcementsStr, "Invalid announcements format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("Announcements cannot exceed 100 entries")
	}
	validTypes := map[string]bool{
		"default": true, "ongoing": true, "success": true, "warning": true, "error": true,
	}
	for i, ann := range list {
		content, ok := ann["content"].(string)
		if !ok || content == "" {
			return common.NewMessage("Announcement #{{index}} is missing the content field", map[string]any{"index": i + 1})
		}
		publishDateAny, exists := ann["publishDate"]
		if !exists {
			return common.NewMessage("Announcement #{{index}} is missing the publish date field", map[string]any{"index": i + 1})
		}
		publishDateStr, ok := publishDateAny.(string)
		if !ok || publishDateStr == "" {
			return common.NewMessage("Announcement #{{index}} publish date cannot be empty", map[string]any{"index": i + 1})
		}
		if _, err := time.Parse(time.RFC3339, publishDateStr); err != nil {
			return common.NewMessage("Announcement #{{index}} has an invalid publish date format", map[string]any{"index": i + 1})
		}
		if t, exists := ann["type"]; exists {
			if typeStr, ok := t.(string); ok {
				if !validTypes[typeStr] {
					return common.NewMessage("Announcement #{{index}} has an invalid type value", map[string]any{"index": i + 1})
				}
			}
		}
		if exceedsMaxCharacters(content, 500) {
			return common.NewMessage("Announcement #{{index}} content cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if extra, exists := ann["extra"]; exists {
			if extraStr, ok := extra.(string); ok && exceedsMaxCharacters(extraStr, 100) {
				return common.NewMessage("Announcement #{{index}} note cannot exceed 100 characters", map[string]any{"index": i + 1})
			}
		}
	}
	return nil
}

func validateFAQ(faqStr string) error {
	list, err := parseJSONArray(faqStr, "Invalid FAQ format: {{error}}")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return common.NewMessage("FAQ cannot exceed 100 entries")
	}
	for i, faq := range list {
		question, ok := faq["question"].(string)
		if !ok || question == "" {
			return common.NewMessage("FAQ #{{index}} is missing the question field", map[string]any{"index": i + 1})
		}
		answer, ok := faq["answer"].(string)
		if !ok || answer == "" {
			return common.NewMessage("FAQ #{{index}} is missing the answer field", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(question, 200) {
			return common.NewMessage("FAQ #{{index}} question cannot exceed 200 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(answer, 1000) {
			return common.NewMessage("FAQ #{{index}} answer cannot exceed 1000 characters", map[string]any{"index": i + 1})
		}
	}
	return nil
}

func getPublishTime(item map[string]any) time.Time {
	if v, ok := item["publishDate"]; ok {
		if s, ok2 := v.(string); ok2 {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

func GetAnnouncements() []map[string]any {
	list := getJSONList(GetConsoleSetting().Announcements)
	sort.SliceStable(list, func(i, j int) bool {
		return getPublishTime(list[i]).After(getPublishTime(list[j]))
	})
	return list
}

func GetFAQ() []map[string]any {
	return getJSONList(GetConsoleSetting().FAQ)
}

func validateUptimeKumaGroups(groupsStr string) error {
	groups, err := parseJSONArray(groupsStr, "Invalid Uptime Kuma group settings format: {{error}}")
	if err != nil {
		return err
	}

	if len(groups) > 20 {
		return common.NewMessage("Uptime Kuma groups cannot exceed 20 entries")
	}

	nameSet := make(map[string]bool)

	for i, group := range groups {
		categoryName, ok := group["categoryName"].(string)
		if !ok || categoryName == "" {
			return common.NewMessage("Group #{{index}} is missing the category name field", map[string]any{"index": i + 1})
		}
		if nameSet[categoryName] {
			return common.NewMessage("Group #{{index}} category name duplicates another group", map[string]any{"index": i + 1})
		}
		nameSet[categoryName] = true
		urlStr, ok := group["url"].(string)
		if !ok || urlStr == "" {
			return common.NewMessage("Group #{{index}} is missing the URL field", map[string]any{"index": i + 1})
		}
		slug, ok := group["slug"].(string)
		if !ok || slug == "" {
			return common.NewMessage("Group #{{index}} is missing the slug field", map[string]any{"index": i + 1})
		}
		description, ok := group["description"].(string)
		if !ok {
			description = ""
		}

		if err := validateURL(urlStr, i+1, groupMessages); err != nil {
			return err
		}

		if exceedsMaxCharacters(categoryName, 50) {
			return common.NewMessage("Group #{{index}} category name cannot exceed 50 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(urlStr, 500) {
			return common.NewMessage("Group #{{index}} URL cannot exceed 500 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(slug, 100) {
			return common.NewMessage("Group #{{index}} slug cannot exceed 100 characters", map[string]any{"index": i + 1})
		}
		if exceedsMaxCharacters(description, 200) {
			return common.NewMessage("Group #{{index}} description cannot exceed 200 characters", map[string]any{"index": i + 1})
		}

		if !slugRegex.MatchString(slug) {
			return common.NewMessage("Group #{{index}} slug can only contain letters, numbers, underscores and hyphens", map[string]any{"index": i + 1})
		}

		if err := checkDangerousContent(description, i+1, groupMessages); err != nil {
			return err
		}
		if err := checkDangerousContent(categoryName, i+1, groupMessages); err != nil {
			return err
		}
	}
	return nil
}

func GetUptimeKumaGroups() []map[string]any {
	return getJSONList(GetConsoleSetting().UptimeKumaGroups)
}

func validateCustomerService(customerServiceStr string) error {
	list, err := parseJSONArray(customerServiceStr, "客服信息预设")
	if err != nil {
		return err
	}
	if len(list) > 50 {
		return fmt.Errorf("客服预设数量不能超过50个")
	}
	for i, item := range list {
		title, ok := item["title"].(string)
		if !ok || strings.TrimSpace(title) == "" {
			return fmt.Errorf("第%d个客服预设缺少名称字段", i+1)
		}
		if exceedsMaxCharacters(title, 100) {
			return fmt.Errorf("第%d个客服预设的名称长度不能超过100字符", i+1)
		}
		if err := checkCustomerServiceDangerousContent(title, i+1, "客服预设名称"); err != nil {
			return err
		}
		if desc, exists := item["description"].(string); exists && desc != "" {
			if exceedsMaxCharacters(desc, 500) {
				return fmt.Errorf("第%d个客服预设的说明长度不能超过500字符", i+1)
			}
			if err := checkCustomerServiceDangerousContent(desc, i+1, "客服预设说明"); err != nil {
				return err
			}
		}
		if contact, exists := item["contact"].(string); exists && contact != "" {
			if exceedsMaxCharacters(contact, 200) {
				return fmt.Errorf("第%d个客服预设的联系方式长度不能超过200字符", i+1)
			}
			if err := checkCustomerServiceDangerousContent(contact, i+1, "客服预设联系方式"); err != nil {
				return err
			}
		}
		if qrcode, exists := item["qrcode"].(string); exists && qrcode != "" {
			if strings.HasPrefix(qrcode, "data:image/") {
				if exceedsMaxCharacters(qrcode, 500000) {
					return fmt.Errorf("第%d个客服预设的二维码图片数据过大（不能超过500KB）", i+1)
				}
				if err := validateDataURLImage(qrcode, i+1, "客服预设二维码", false); err != nil {
					return err
				}
			} else {
				if exceedsMaxCharacters(qrcode, 1000) {
					return fmt.Errorf("第%d个客服预设的二维码地址长度不能超过1000字符", i+1)
				}
				if err := validateCustomerServiceURL(qrcode, i+1, "客服预设二维码"); err != nil {
					return err
				}
			}
		}
		if link, exists := item["link"].(string); exists && strings.TrimSpace(link) != "" {
			if exceedsMaxCharacters(link, 1000) {
				return fmt.Errorf("第%d个客服预设的链接长度不能超过1000字符", i+1)
			}
			if err := validateCustomerServiceURL(link, i+1, "客服预设链接"); err != nil {
				return err
			}
			if err := checkCustomerServiceDangerousContent(link, i+1, "客服预设链接"); err != nil {
				return err
			}
		}
	}
	return nil
}

func GetCustomerService() []map[string]interface{} {
	return getJSONList(GetConsoleSetting().CustomerService)
}
