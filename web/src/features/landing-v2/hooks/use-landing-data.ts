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
*/

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatUptimePct,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ModelCategory, ModelCatalogItem } from '../types'

function inferProvider(name: string): string {
  const n = name.toLowerCase()
  if (n.startsWith('deepseek') || n.includes('deepseek')) return 'DeepSeek'
  if (n.startsWith('claude') || n.includes('anthropic')) return 'Anthropic'
  if (n.startsWith('gpt') || n.startsWith('o1') || n.startsWith('o3') || n.startsWith('chatgpt') || n.includes('openai')) return 'OpenAI'
  if (n.startsWith('gemini') || n.includes('google')) return 'Google'
  if (n.startsWith('qwen') || n.includes('alibaba')) return 'Alibaba'
  if (n.startsWith('glm') || n.includes('zhipu')) return 'Zhipu AI'
  if (n.startsWith('moonshot') || n.includes('kimi')) return 'Moonshot'
  if (n.startsWith('minimax')) return 'MiniMax'
  if (n.startsWith('mistral')) return 'Mistral'
  if (n.startsWith('llama') || n.includes('meta')) return 'Meta'
  return 'AI Provider'
}

function inferContext(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('gemini')) return '1M'
  if (n.includes('claude-3') || n.includes('claude-3-7') || n.includes('claude-3.7')) return '200k'
  if (n.includes('gpt-4o') || n.includes('o1') || n.includes('o3')) return '128k'
  if (n.includes('deepseek')) return '64k'
  if (n.includes('qwen-2.5')) return '32k'
  return '64k'
}

function findPerfModel(
  name: string,
  perfMap: Map<string, PerfModelSummary>
): PerfModelSummary | undefined {
  if (perfMap.has(name)) return perfMap.get(name)
  const lower = name.toLowerCase().trim()
  for (const [key, val] of perfMap.entries()) {
    if (key.toLowerCase().trim() === lower) return val
  }
  return undefined
}

function inferCategories(name: string, tags?: string): ModelCategory[] {
  const categories: ModelCategory[] = ['all']
  const text = `${name} ${tags || ''}`.toLowerCase()

  if (
    text.includes('r1') ||
    text.includes('o1') ||
    text.includes('o3') ||
    text.includes('reason') ||
    text.includes('thinking')
  ) {
    categories.push('reasoning')
  }

  if (
    text.includes('claude') ||
    text.includes('deepseek') ||
    text.includes('gpt') ||
    text.includes('coder') ||
    text.includes('qwen') ||
    text.includes('code')
  ) {
    categories.push('coding')
  }

  if (
    text.includes('flash') ||
    text.includes('mini') ||
    text.includes('v3') ||
    text.includes('turbo') ||
    text.includes('lite') ||
    text.includes('nano')
  ) {
    categories.push('cost-effective')
  }

  if (
    text.includes('vision') ||
    text.includes('4o') ||
    text.includes('gemini') ||
    text.includes('vl') ||
    text.includes('omni') ||
    text.includes('image')
  ) {
    categories.push('multimodal')
  }

  return categories
}

export function useLandingData() {
  const { status } = useStatus()
  const {
    models: rawModels,
    isLoading: isPricingLoading,
  } = usePricingData()

  // 与模型列表/详情完全一致的 24 小时真实性能监控数据源
  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    staleTime: 60 * 1000,
    retry: false,
  })

  const perfMap = useMemo(() => {
    const map = new Map<string, PerfModelSummary>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(model.model_name, model)
    }
    return map
  }, [perfQuery.data])

  // 1. 动态获取实际外部 API 域名
  const apiBase = useMemo(() => {
    const rawServer = (status?.server_address as string | undefined)?.trim()
    if (rawServer) {
      const clean = rawServer.replace(/\/+$/, '')
      return clean.endsWith('/v1') ? clean : `${clean}/v1`
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/v1`
    }
    return 'https://api.yourdomain.com/v1'
  }, [status?.server_address])

  // 2. 动态获取站点系统名称与文档链接
  const rawSystemName = (status?.system_name as string) || ''
  const systemName = rawSystemName === 'New API' ? '' : rawSystemName
  const docsUrl = (status?.docs_link as string) || '/docs'

  // 3. 动态将后端真实模型列表映射为展示项，对齐真实成功率监控与延迟指标
  const dynamicModels = useMemo<ModelCatalogItem[]>(() => {
    if (!rawModels || rawModels.length === 0) {
      return []
    }

    return rawModels.map((m: PricingModel) => {
      const ctx = m.context_length
        ? `${Math.round(m.context_length / 1024)}k`
        : inferContext(m.model_name)

      const perf = findPerfModel(m.model_name, perfMap)
      let availability = '—'
      let availabilityRate: number | undefined = undefined
      let latency = '—'

      if (perf && Number.isFinite(perf.success_rate)) {
        availabilityRate = Math.min(100, Math.max(0, perf.success_rate))
        availability = formatUptimePct(availabilityRate)
        if (perf.avg_latency_ms > 0) {
          latency = formatLatency(perf.avg_latency_ms)
        }
      }

      return {
        id: m.model_name,
        name: m.model_name,
        provider: m.vendor_name || inferProvider(m.model_name),
        context: ctx,
        availability,
        availabilityRate,
        latency,
        category: inferCategories(m.model_name, m.tags),
        description:
          m.description ||
          m.vendor_description ||
          `${m.vendor_name || inferProvider(m.model_name)} 高可用接入模型`,
      }
    })
  }, [rawModels, perfMap])

  // 4. 获取当前第一个可用主力模型，用于代码示例动态填充
  const primaryModel = useMemo(() => {
    if (dynamicModels.length > 0) {
      // 优先选取 deepseek 或 gpt 或 claude
      const preferred = dynamicModels.find(
        (m) =>
          m.id.toLowerCase().includes('deepseek') ||
          m.id.toLowerCase().includes('gpt-4') ||
          m.id.toLowerCase().includes('claude')
      )
      return preferred ? preferred.id : dynamicModels[0].id
    }
    return ''
  }, [dynamicModels])

  return {
    apiBase,
    systemName,
    docsUrl,
    models: dynamicModels,
    isLoading: isPricingLoading,
    primaryModel,
    totalModelsCount: rawModels?.length || dynamicModels.length,
  }
}
