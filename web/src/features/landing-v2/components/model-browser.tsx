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

import { Search, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import type { ModelCategory, ModelCatalogItem } from '../types'

const CATEGORIES: { key: ModelCategory; label: string }[] = [
  { key: 'all', label: 'All Models' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'coding', label: 'Coding' },
  { key: 'cost-effective', label: 'Cost-Effective' },
  { key: 'multimodal', label: 'Multimodal' },
]

interface ModelBrowserProps {
  models: ModelCatalogItem[]
  isLoading?: boolean
}

export function ModelBrowser({ models, isLoading }: ModelBrowserProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { copyToClipboard } = useCopyToClipboard()

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleCategorySelect = (category: ModelCategory) => {
    setSelectedCategory(category)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const handleCopyModel = async (modelId: string) => {
    const success = await copyToClipboard(modelId)
    if (success) {
      setCopiedId(modelId)
      toast.success(`${t('Model ID copied to clipboard')}: ${modelId}`)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchCat =
        selectedCategory === 'all' || m.category.includes(selectedCategory)
      const q = searchQuery.toLowerCase().trim()
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [models, selectedCategory, searchQuery])

  const totalItems = filteredModels.length
  const totalPages = pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize) || 1
  const validCurrentPage = Math.min(currentPage, totalPages)

  const paginatedModels = useMemo(() => {
    if (pageSize === -1) return filteredModels
    const start = (validCurrentPage - 1) * pageSize
    return filteredModels.slice(start, start + pageSize)
  }, [filteredModels, validCurrentPage, pageSize])

  let tableContent = null
  if (isLoading && models.length === 0) {
    tableContent = (
      <tr>
        <td colSpan={5} className='py-8 text-center text-muted-foreground'>
          {t('Loading...')}
        </td>
      </tr>
    )
  } else if (filteredModels.length === 0) {
    tableContent = (
      <tr>
        <td colSpan={5} className='py-8 text-center text-muted-foreground'>
          {t('No matching models found')}
        </td>
      </tr>
    )
  } else {
    tableContent = paginatedModels.map((model) => (
      <tr
        key={model.id}
        className='hover:bg-muted/30 transition-colors group'
      >
        {/* 模型名与提供商 */}
        <td className='py-3 pl-4 pr-3'>
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-foreground'>
              {model.name}
            </span>
            {model.badge && (
              <span className='rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border'>
                {model.badge}
              </span>
            )}
          </div>
          <div className='text-muted-foreground text-[11px] mt-0.5 flex items-center gap-1.5'>
            <span>{model.provider}</span>
            <span className='text-border'>•</span>
            <span className='text-muted-foreground/80 truncate max-w-xs font-sans'>
              {model.description}
            </span>
          </div>
        </td>

        {/* 上下文 */}
        <td className='py-3 px-3 text-foreground/90'>
          {model.context}
        </td>

        {/* 可用性 */}
        <td className='py-3 px-3'>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              model.availabilityRate != null
                ? getSuccessRateTextClass(model.availabilityRate)
                : 'text-muted-foreground'
            )}
            title={
              model.availabilityRate != null
                ? t(
                    'Success rate excludes business rejections and includes the current partial hour.'
                  )
                : t('No performance metrics available in the last 24 hours')
            }
          >
            <span
              className={cn(
                'size-1.5 rounded-full shrink-0',
                model.availabilityRate != null
                  ? getSuccessRateDotClass(model.availabilityRate)
                  : 'bg-muted-foreground/30'
              )}
            />
            {model.availability}
          </span>
        </td>

        {/* 延迟 */}
        <td className='py-3 px-3 text-muted-foreground'>
          {model.latency}
        </td>

        {/* 快捷复制 */}
        <td className='py-3 pr-4 text-right'>
          <button
            type='button'
            onClick={() => handleCopyModel(model.id)}
            className='inline-flex items-center gap-1 rounded border border-border/80 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer'
            title={t('Copy model ID')}
          >
            {copiedId === model.id ? (
              <>
                <Check className='size-3 text-emerald-500' />
                <span className='text-emerald-500'>{t('Copied')}</span>
              </>
            ) : (
              <>
                <Copy className='size-3' />
                <span>{t('Copy ID')}</span>
              </>
            )}
          </button>
        </td>
      </tr>
    ))
  }

  return (
    <section className='py-12 md:py-16'>
      <div className='mx-auto max-w-6xl px-6'>
        {/* 区域标题与简介 */}
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8'>
          <div>
            <h2 className='text-xl font-bold tracking-tight text-foreground font-mono sm:text-2xl'>
              {t('Supported Models & Availability')}
            </h2>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('Real-time model catalog and availability metrics with enterprise-grade routing.')}
            </p>
          </div>

          {/* 搜索过滤输入框 */}
          <div className='relative w-full md:w-72'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('Search model name or provider...')}
              className='h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono'
            />
          </div>
        </div>

        {/* 分类切换 Pills */}
        <div className='flex flex-wrap items-center gap-1.5 mb-6 pb-1'>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type='button'
              onClick={() => handleCategorySelect(cat.key)}
              className={`rounded-md px-3 py-1 text-xs font-mono transition-colors cursor-pointer ${
                selectedCategory === cat.key
                  ? 'bg-foreground text-background font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {t(cat.label)}
            </button>
          ))}
        </div>

        {/* 极简高密度数据表格 */}
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <table className='w-full text-left text-xs font-mono'>
            <thead className='border-b border-border bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wider'>
              <tr>
                <th className='py-3 pl-4 pr-3'>{t('Model')}</th>
                <th className='py-3 px-3'>{t('Context')}</th>
                <th className='py-3 px-3'>{t('Availability')}</th>
                <th className='py-3 px-3'>{t('Latency')}</th>
                <th className='py-3 pr-4 text-right'>{t('Action')}</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border/60'>
              {tableContent}
            </tbody>
          </table>

          {/* 极简紧凑分页栏 */}
          {totalItems > 0 && (
            <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/10 text-xs font-mono text-muted-foreground'>
              {/* 左侧：条数与每页显示配置 */}
              <div className='flex items-center gap-3'>
                <span>
                  {t('Showing')}{' '}
                  <span className='text-foreground font-semibold'>
                    {pageSize === -1 ? 1 : (validCurrentPage - 1) * pageSize + 1}
                  </span>
                  {' - '}
                  <span className='text-foreground font-semibold'>
                    {pageSize === -1
                      ? totalItems
                      : Math.min(validCurrentPage * pageSize, totalItems)}
                  </span>
                  {' '}{t('of')}{' '}
                  <span className='text-foreground font-semibold'>{totalItems}</span>{' '}
                  {t('models')}
                </span>

                <div className='hidden sm:flex items-center gap-1 border-l border-border/80 pl-3'>
                  <span className='text-[11px] text-muted-foreground mr-1'>
                    {t('Per page')}:
                  </span>
                  {[10, 20, 50].map((size) => (
                    <button
                      key={size}
                      type='button'
                      onClick={() => handlePageSizeChange(size)}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                        pageSize === size
                          ? 'bg-foreground text-background font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                  <button
                    type='button'
                    onClick={() => handlePageSizeChange(-1)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                      pageSize === -1
                        ? 'bg-foreground text-background font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {t('All')}
                  </button>
                </div>
              </div>

              {/* 右侧：分页导航 */}
              {totalPages > 1 && (
                <div className='flex items-center gap-1.5'>
                  <button
                    type='button'
                    disabled={validCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className='inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors cursor-pointer text-xs'
                  >
                    <ChevronLeft className='size-3.5' />
                    <span>{t('Previous')}</span>
                  </button>

                  <span className='px-2 text-xs text-foreground'>
                    {validCurrentPage}{' '}
                    <span className='text-muted-foreground'>/</span>{' '}
                    {totalPages}
                  </span>

                  <button
                    type='button'
                    disabled={validCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className='inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors cursor-pointer text-xs'
                  >
                    <span>{t('Next')}</span>
                    <ChevronRight className='size-3.5' />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
