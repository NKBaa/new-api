package opencode

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

// TestOpenCodeDefaultTestModelIsReachable 保证常量与预置模型列表一致，且确实属于
// 上游免费层。若把常量改回通用兜底值（gpt-4o-mini），渠道测试会拿到
// unknown model 错误，因此这里锁住契约。
func TestOpenCodeDefaultTestModelIsReachable(t *testing.T) {
	model := constant.OpenCodeDefaultTestModel
	assert.NotEqual(t, "gpt-4o-mini", model)
	assert.Contains(t, ModelList, model,
		"the channel test default must be one of the preset models")
}
