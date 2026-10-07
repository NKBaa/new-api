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

func parseJSONArray(jsonStr string, typeName string) ([]map[string]interface{}, error) {
	var list []map[string]interface{}
	if err := common.UnmarshalJsonStr(jsonStr, &list); err != nil {
		return nil, fmt.Errorf("%s格式错误：%s", typeName, err.Error())
	}
	return list, nil
}

func exceedsMaxCharacters(s string, max int) bool {
	return len(utf16.Encode([]rune(s))) > max
}

func validateURL(urlStr string, index int, itemType string) error {
	if !urlRegex.MatchString(urlStr) {
		return fmt.Errorf("第%d个%s的URL格式不正确", index, itemType)
	}
	if _, err := url.Parse(urlStr); err != nil {
		return fmt.Errorf("第%d个%s的URL无法解析：%s", index, itemType, err.Error())
	}
	return nil
}

func checkDangerousContent(content string, index int, itemType string) error {
	lower := strings.ToLower(content)
	for _, d := range dangerousChars {
		if strings.Contains(lower, d) {
			return fmt.Errorf("第%d个%s包含不允许的内容", index, itemType)
		}
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

func getJSONList(jsonStr string) []map[string]interface{} {
	if jsonStr == "" {
		return []map[string]interface{}{}
	}
	var list []map[string]interface{}
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
		return fmt.Errorf("未知的设置类型：%s", settingType)
	}
}

func validateApiInfo(apiInfoStr string) error {
	apiInfoList, err := parseJSONArray(apiInfoStr, "API信息")
	if err != nil {
		return err
	}

	if len(apiInfoList) > 50 {
		return fmt.Errorf("API信息数量不能超过50个")
	}

	for i, apiInfo := range apiInfoList {
		urlStr, ok := apiInfo["url"].(string)
		if !ok || urlStr == "" {
			return fmt.Errorf("第%d个API信息缺少URL字段", i+1)
		}
		route, ok := apiInfo["route"].(string)
		if !ok || route == "" {
			return fmt.Errorf("第%d个API信息缺少线路描述字段", i+1)
		}
		description, ok := apiInfo["description"].(string)
		if !ok || description == "" {
			return fmt.Errorf("第%d个API信息缺少说明字段", i+1)
		}
		color, ok := apiInfo["color"].(string)
		if !ok || color == "" {
			return fmt.Errorf("第%d个API信息缺少颜色字段", i+1)
		}

		if err := validateURL(urlStr, i+1, "API信息"); err != nil {
			return err
		}

		if exceedsMaxCharacters(urlStr, 500) {
			return fmt.Errorf("第%d个API信息的URL长度不能超过500字符", i+1)
		}
		if exceedsMaxCharacters(route, 100) {
			return fmt.Errorf("第%d个API信息的线路描述长度不能超过100字符", i+1)
		}
		if exceedsMaxCharacters(description, 200) {
			return fmt.Errorf("第%d个API信息的说明长度不能超过200字符", i+1)
		}

		if !validColors[color] {
			return fmt.Errorf("第%d个API信息的颜色值不合法", i+1)
		}

		if err := checkDangerousContent(description, i+1, "API信息"); err != nil {
			return err
		}
		if err := checkDangerousContent(route, i+1, "API信息"); err != nil {
			return err
		}
	}
	return nil
}

func GetApiInfo() []map[string]interface{} {
	return getJSONList(GetConsoleSetting().ApiInfo)
}

func validateAnnouncements(announcementsStr string) error {
	list, err := parseJSONArray(announcementsStr, "系统公告")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return fmt.Errorf("系统公告数量不能超过100个")
	}
	validTypes := map[string]bool{
		"default": true, "ongoing": true, "success": true, "warning": true, "error": true,
	}
	for i, ann := range list {
		content, ok := ann["content"].(string)
		if !ok || content == "" {
			return fmt.Errorf("第%d个公告缺少内容字段", i+1)
		}
		publishDateAny, exists := ann["publishDate"]
		if !exists {
			return fmt.Errorf("第%d个公告缺少发布日期字段", i+1)
		}
		publishDateStr, ok := publishDateAny.(string)
		if !ok || publishDateStr == "" {
			return fmt.Errorf("第%d个公告的发布日期不能为空", i+1)
		}
		if _, err := time.Parse(time.RFC3339, publishDateStr); err != nil {
			return fmt.Errorf("第%d个公告的发布日期格式错误", i+1)
		}
		if t, exists := ann["type"]; exists {
			if typeStr, ok := t.(string); ok {
				if !validTypes[typeStr] {
					return fmt.Errorf("第%d个公告的类型值不合法", i+1)
				}
			}
		}
		if exceedsMaxCharacters(content, 500) {
			return fmt.Errorf("第%d个公告的内容长度不能超过500字符", i+1)
		}
		if extra, exists := ann["extra"]; exists {
			if extraStr, ok := extra.(string); ok && exceedsMaxCharacters(extraStr, 100) {
				return fmt.Errorf("第%d个公告的说明长度不能超过100字符", i+1)
			}
		}
	}
	return nil
}

func validateFAQ(faqStr string) error {
	list, err := parseJSONArray(faqStr, "FAQ信息")
	if err != nil {
		return err
	}
	if len(list) > 100 {
		return fmt.Errorf("FAQ数量不能超过100个")
	}
	for i, faq := range list {
		question, ok := faq["question"].(string)
		if !ok || question == "" {
			return fmt.Errorf("第%d个FAQ缺少问题字段", i+1)
		}
		answer, ok := faq["answer"].(string)
		if !ok || answer == "" {
			return fmt.Errorf("第%d个FAQ缺少答案字段", i+1)
		}
		if exceedsMaxCharacters(question, 200) {
			return fmt.Errorf("第%d个FAQ的问题长度不能超过200字符", i+1)
		}
		if exceedsMaxCharacters(answer, 1000) {
			return fmt.Errorf("第%d个FAQ的答案长度不能超过1000字符", i+1)
		}
	}
	return nil
}

func getPublishTime(item map[string]interface{}) time.Time {
	if v, ok := item["publishDate"]; ok {
		if s, ok2 := v.(string); ok2 {
			if t, err := time.Parse(time.RFC3339, s); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

func GetAnnouncements() []map[string]interface{} {
	list := getJSONList(GetConsoleSetting().Announcements)
	sort.SliceStable(list, func(i, j int) bool {
		return getPublishTime(list[i]).After(getPublishTime(list[j]))
	})
	return list
}

func GetFAQ() []map[string]interface{} {
	return getJSONList(GetConsoleSetting().FAQ)
}

func validateUptimeKumaGroups(groupsStr string) error {
	groups, err := parseJSONArray(groupsStr, "Uptime Kuma分组配置")
	if err != nil {
		return err
	}

	if len(groups) > 20 {
		return fmt.Errorf("Uptime Kuma分组数量不能超过20个")
	}

	nameSet := make(map[string]bool)

	for i, group := range groups {
		categoryName, ok := group["categoryName"].(string)
		if !ok || categoryName == "" {
			return fmt.Errorf("第%d个分组缺少分类名称字段", i+1)
		}
		if nameSet[categoryName] {
			return fmt.Errorf("第%d个分组的分类名称与其他分组重复", i+1)
		}
		nameSet[categoryName] = true
		urlStr, ok := group["url"].(string)
		if !ok || urlStr == "" {
			return fmt.Errorf("第%d个分组缺少URL字段", i+1)
		}
		slug, ok := group["slug"].(string)
		if !ok || slug == "" {
			return fmt.Errorf("第%d个分组缺少Slug字段", i+1)
		}
		description, ok := group["description"].(string)
		if !ok {
			description = ""
		}

		if err := validateURL(urlStr, i+1, "分组"); err != nil {
			return err
		}

		if exceedsMaxCharacters(categoryName, 50) {
			return fmt.Errorf("第%d个分组的分类名称长度不能超过50字符", i+1)
		}
		if exceedsMaxCharacters(urlStr, 500) {
			return fmt.Errorf("第%d个分组的URL长度不能超过500字符", i+1)
		}
		if exceedsMaxCharacters(slug, 100) {
			return fmt.Errorf("第%d个分组的Slug长度不能超过100字符", i+1)
		}
		if exceedsMaxCharacters(description, 200) {
			return fmt.Errorf("第%d个分组的描述长度不能超过200字符", i+1)
		}

		if !slugRegex.MatchString(slug) {
			return fmt.Errorf("第%d个分组的Slug只能包含字母、数字、下划线和连字符", i+1)
		}

		if err := checkDangerousContent(description, i+1, "分组"); err != nil {
			return err
		}
		if err := checkDangerousContent(categoryName, i+1, "分组"); err != nil {
			return err
		}
	}
	return nil
}

func GetUptimeKumaGroups() []map[string]interface{} {
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
		if err := checkDangerousContent(title, i+1, "客服预设名称"); err != nil {
			return err
		}
		if desc, exists := item["description"].(string); exists && desc != "" {
			if exceedsMaxCharacters(desc, 500) {
				return fmt.Errorf("第%d个客服预设的说明长度不能超过500字符", i+1)
			}
			if err := checkDangerousContent(desc, i+1, "客服预设说明"); err != nil {
				return err
			}
		}
		if contact, exists := item["contact"].(string); exists && contact != "" {
			if exceedsMaxCharacters(contact, 200) {
				return fmt.Errorf("第%d个客服预设的联系方式长度不能超过200字符", i+1)
			}
			if err := checkDangerousContent(contact, i+1, "客服预设联系方式"); err != nil {
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
				if err := validateURL(qrcode, i+1, "客服预设二维码"); err != nil {
					return err
				}
			}
		}
		if link, exists := item["link"].(string); exists && strings.TrimSpace(link) != "" {
			if exceedsMaxCharacters(link, 1000) {
				return fmt.Errorf("第%d个客服预设的链接长度不能超过1000字符", i+1)
			}
			if err := validateURL(link, i+1, "客服预设链接"); err != nil {
				return err
			}
			if err := checkDangerousContent(link, i+1, "客服预设链接"); err != nil {
				return err
			}
		}
	}
	return nil
}

func GetCustomerService() []map[string]interface{} {
	return getJSONList(GetConsoleSetting().CustomerService)
}
