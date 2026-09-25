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
import {
  Code,
  Edit,
  FileText,
  ListFilter,
  Plus,
  RotateCcw,
  Search,
  Table,
  Trash2,
} from 'lucide-react'
import { t } from 'i18next'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StaticDataTable, TruncatedCell } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { JsonCodeEditor } from '@/components/json-code-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import type { ErrorMappingRule } from '../types'

const DEFAULT_ERROR_MAPPING_PRESETS: ErrorMappingRule[] = [
  {
    id: 1,
    name: 'Embeddings API 不支持',
    match_code: 0,
    keywords: 'Embeddings API is not supported, not supported for this platform',
    replace_msg: '当前模型不支持 Embeddings 操作，请检查所选模型。',
    override_code: 400,
    enabled: true,
  },
  {
    id: 2,
    name: '输入或生成敏感内容拦截',
    match_code: 0,
    keywords:
      '不安全或敏感内容, 易产生敏感内容的提示语, sensitive content, content_filter, prompt was filtered',
    replace_msg: '输入或生成内容触发安全合规策略，请调整提示词后重试。',
    override_code: 400,
    enabled: true,
  },
  {
    id: 3,
    name: '上游模型高负载或饱和',
    match_code: 0,
    keywords:
      'currently experiencing high demand, spikes in demand, 当前分组负载已饱和, 负载已饱和, high traffic',
    replace_msg: '当前模型服务请求量激增或高负载，请稍后重试。',
    override_code: 503,
    enabled: true,
  },
  {
    id: 4,
    name: '上游账户或组织不存在',
    match_code: 0,
    keywords: 'User does not exist, organization does not exist',
    replace_msg: '上游服务认证异常或账户不可用，请联系管理员。',
    override_code: 502,
    enabled: true,
  },
  {
    id: 5,
    name: '分组内无可用模型渠道',
    match_code: 0,
    keywords:
      'not supported by any configured account in this group, no available channel',
    replace_msg:
      '当前分组暂无支持该模型的可用渠道，请检查模型名称或更换分组。',
    override_code: 404,
    enabled: true,
  },
  {
    id: 6,
    name: '上游服务暂时不可用',
    match_code: 503,
    keywords:
      'Service temporarily unavailable, temporarily unavailable, service unavailable',
    replace_msg: '上游服务暂时不可用，请稍后重试。',
    override_code: 503,
    enabled: true,
  },
  {
    id: 7,
    name: '模型或资源未找到',
    match_code: 404,
    keywords: 'Requested entity was not found, NOT_FOUND, model_not_found',
    replace_msg: '请求的模型或上游资源未找到，请核对模型配置。',
    override_code: 404,
    enabled: true,
  },
  {
    id: 8,
    name: '上游配额耗尽或超频',
    match_code: 0,
    keywords:
      'exceeded your current quota, Quota exceeded, Resource has been exhausted, free_tier_reque, rate limit, quota',
    replace_msg: '上游渠道配额已耗尽或超出调用频率限制，请稍后重试。',
    override_code: 429,
    enabled: true,
  },
  {
    id: 9,
    name: '上下文长度超出模型限制',
    match_code: 400,
    keywords:
      'context_length_exceeded, maximum context length, token count exceeds, prompt too long',
    replace_msg: '提示词长度超出该模型上下文上限，请精简输入后重试。',
    override_code: 400,
    enabled: true,
  },
  {
    id: 10,
    name: '上游认证凭据失效',
    match_code: 401,
    keywords:
      'invalid_api_key, incorrect api key, unauthorized, authentication failed',
    replace_msg: '上游服务认证凭据已失效，请联系管理员处理。',
    override_code: 502,
    enabled: true,
  },
]

function normalizeRulesFromJson(raw: unknown): ErrorMappingRule[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.map((item: Record<string, unknown>, index: number) => {
    const rawKeywords = item.keywords
    let formattedKeywords = ''
    if (Array.isArray(rawKeywords)) {
      formattedKeywords = rawKeywords.filter(Boolean).map(String).join(', ')
    } else if (typeof rawKeywords === 'string') {
      formattedKeywords = rawKeywords.trim()
    } else if (rawKeywords != null) {
      formattedKeywords = String(rawKeywords)
    }

    let formattedReplaceMsg = ''
    if (typeof item.replace_msg === 'string') {
      formattedReplaceMsg = item.replace_msg
    } else if (item.replace_msg != null) {
      formattedReplaceMsg = String(item.replace_msg)
    }

    return {
      id: typeof item.id === 'number' ? item.id : index + 1,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : t('Rule #{{index}}', { index: index + 1 }),
      match_code:
        typeof item.match_code === 'number'
          ? item.match_code
          : Number(item.match_code) || 0,
      keywords: formattedKeywords,
      replace_msg: formattedReplaceMsg,
      override_code:
        typeof item.override_code === 'number'
          ? item.override_code
          : Number(item.override_code) || 0,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    }
  })
}

interface ErrorMappingSectionProps {
  defaultEnabled?: boolean
  defaultRules?: string
}

export function ErrorMappingSection({
  defaultEnabled = true,
  defaultRules = '',
}: ErrorMappingSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const [enabled, setEnabled] = useState<boolean>(defaultEnabled)
  const [rules, setRules] = useState<ErrorMappingRule[]>(() => {
    const trimmed = (defaultRules || '').trim()
    if (!trimmed || trimmed === '[]') {
      return DEFAULT_ERROR_MAPPING_PRESETS
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeRulesFromJson(parsed)
      }
    } catch {
      // ignore parse error, fallback to presets
    }
    return DEFAULT_ERROR_MAPPING_PRESETS
  })

  // Mode: Visual vs JSON
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')
  const [jsonValue, setJsonValue] = useState(() =>
    JSON.stringify(rules, null, 2)
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [editingRule, setEditingRule] = useState<ErrorMappingRule | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)

  // Dialog draft state
  const [draftName, setDraftName] = useState('')
  const [draftMatchCode, setDraftMatchCode] = useState('0')
  const [draftKeywords, setDraftKeywords] = useState('')
  const [draftReplaceMsg, setDraftReplaceMsg] = useState('')
  const [draftOverrideCode, setDraftOverrideCode] = useState('0')
  const [draftEnabled, setDraftEnabled] = useState(true)

  const handleModeChange = (newMode: string) => {
    if (newMode === 'json') {
      setJsonValue(JSON.stringify(rules, null, 2))
      setEditMode('json')
    } else {
      const trimmed = jsonValue.trim()
      if (!trimmed || trimmed === '[]') {
        setRules([])
        setEditMode('visual')
        return
      }
      try {
        const parsed = JSON.parse(trimmed)
        const normalized = normalizeRulesFromJson(parsed)
        setRules(normalized)
        setEditMode('visual')
      } catch {
        toast.error(t('Invalid rules JSON format'))
      }
    }
  }

  const handleOpenAdd = () => {
    setEditingRule(null)
    setDraftName('')
    setDraftMatchCode('0')
    setDraftKeywords('')
    setDraftReplaceMsg('')
    setDraftOverrideCode('0')
    setDraftEnabled(true)
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (rule: ErrorMappingRule) => {
    setEditingRule(rule)
    setDraftName(rule.name)
    setDraftMatchCode(String(rule.match_code ?? 0))
    setDraftKeywords(rule.keywords || '')
    setDraftReplaceMsg(rule.replace_msg || '')
    setDraftOverrideCode(String(rule.override_code ?? 0))
    setDraftEnabled(rule.enabled ?? true)
    setIsDialogOpen(true)
  }

  const handleSaveRule = () => {
    const trimmedName = draftName.trim()
    const trimmedReplaceMsg = draftReplaceMsg.trim()
    if (!trimmedName) {
      toast.error(t('Rule name is required'))
      return
    }
    if (!trimmedReplaceMsg) {
      toast.error(t('Replace message is required'))
      return
    }

    const matchCodeNum = Number.parseInt(draftMatchCode, 10) || 0
    const overrideCodeNum = Number.parseInt(draftOverrideCode, 10) || 0

    if (editingRule) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                name: trimmedName,
                match_code: matchCodeNum,
                keywords: draftKeywords.trim(),
                replace_msg: trimmedReplaceMsg,
                override_code: overrideCodeNum,
                enabled: draftEnabled,
              }
            : r
        )
      )
    } else {
      const nextId =
        rules.length > 0 ? Math.max(...rules.map((r) => r.id || 0)) + 1 : 1
      setRules((prev) => [
        ...prev,
        {
          id: nextId,
          name: trimmedName,
          match_code: matchCodeNum,
          keywords: draftKeywords.trim(),
          replace_msg: trimmedReplaceMsg,
          override_code: overrideCodeNum,
          enabled: draftEnabled,
        },
      ])
    }

    setIsDialogOpen(false)
  }

  const handleDeleteRule = (id: number) => {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleToggleRule = (id: number, checked: boolean) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: checked } : r))
    )
  }

  const handleRestorePresets = () => {
    setRules(DEFAULT_ERROR_MAPPING_PRESETS)
    setJsonValue(JSON.stringify(DEFAULT_ERROR_MAPPING_PRESETS, null, 2))
    setConfirmRestoreOpen(false)
    toast.success(t('Presets restored successfully. Click Save to persist.'))
  }

  const handleSaveAll = async () => {
    let rulesToPersist = rules
    if (editMode === 'json') {
      const trimmed = jsonValue.trim()
      if (!trimmed || trimmed === '[]') {
        rulesToPersist = []
      } else {
        try {
          const parsed = JSON.parse(trimmed)
          rulesToPersist = normalizeRulesFromJson(parsed)
          setRules(rulesToPersist)
        } catch {
          toast.error(t('Invalid rules JSON format'))
          return
        }
      }
    }

    try {
      await updateOption.mutateAsync({
        key: 'ErrorSanitizationEnabled',
        value: enabled ? 'true' : 'false',
      })
      await updateOption.mutateAsync({
        key: 'ErrorMappingRules',
        value: JSON.stringify(rulesToPersist),
      })
      toast.success(t('Settings saved successfully'))
    } catch {
      toast.error(t('Failed to save settings'))
    }
  }

  const filteredRules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return rules
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.replace_msg.toLowerCase().includes(q) ||
        r.keywords.toLowerCase().includes(q) ||
        String(r.match_code).includes(q) ||
        String(r.override_code).includes(q)
    )
  }, [rules, searchQuery])

  return (
    <SettingsSection title={t('Error Sanitization')}>
      <div className='flex flex-col gap-6'>
        <div className='text-muted-foreground space-y-1 text-sm'>
          <p>
            {t(
              'Sanitize upstream provider errors to prevent leaking raw internal addresses, credentials, and organizations, returning standardized error causes to clients.'
            )}
          </p>
        </div>
        <SettingsPageFormActions
          onSave={handleSaveAll}
          isSaving={updateOption.isPending}
        />

        {/* Master switch */}
        <SettingsSwitchItem>
          <SettingsSwitchContent>
            <Label className='text-base font-medium'>
              {t('Enable Error Sanitization')}
            </Label>
            <p className='text-muted-foreground text-sm'>
              {t(
                'When enabled, raw upstream errors will be mapped to clean, user-friendly explanations. System logs in admin console retain 100% of raw error details.'
              )}
            </p>
          </SettingsSwitchContent>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </SettingsSwitchItem>

        {/* Visual vs JSON Mode Tabs */}
        <Tabs
          value={editMode}
          onValueChange={handleModeChange}
          className='gap-0'
        >
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <TabsList aria-label={t('Rule editor mode')}>
              <TabsTrigger value='visual'>
                <Table className='h-4 w-4' aria-hidden='true' />
                {t('Visual')}
              </TabsTrigger>
              <TabsTrigger value='json'>
                <Code className='h-4 w-4' aria-hidden='true' />
                {t('JSON')}
              </TabsTrigger>
            </TabsList>

            {editMode === 'visual' && (
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setConfirmRestoreOpen(true)}
                  className='gap-1.5'
                >
                  <RotateCcw className='h-4 w-4' />
                  {t('Restore Presets')}
                </Button>
                <Button size='sm' onClick={handleOpenAdd} className='gap-1.5'>
                  <Plus className='h-4 w-4' />
                  {t('Add Rule')}
                </Button>
              </div>
            )}
          </div>

          {/* Visual Mode */}
          <TabsContent value='visual' className='mt-4 flex flex-col gap-4'>
            {/* Search toolbar */}
            <div className='flex items-center'>
              <div className='relative max-w-sm flex-1'>
                <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('Search rules, keywords, status codes...')}
                  className='pl-9'
                />
              </div>
            </div>

            {/* Rules Table */}
            {rules.length === 0 ? (
              <EmptyState
                icon={ListFilter}
                title={t('No error mapping rules')}
                description={t(
                  'Add custom rules or restore preset rules covering typical upstream error scenarios.'
                )}
                action={
                  <Button variant='outline' onClick={handleRestorePresets}>
                    <FileText className='mr-2 h-4 w-4' />
                    {t('Restore Presets')}
                  </Button>
                }
              />
            ) : (
              <div className='rounded-md border'>
                <StaticDataTable
                  data={filteredRules}
                  getRowKey={(rule) => String(rule.id)}
                  className='focus-visible:outline-ring overflow-x-auto rounded-none border-0'
                  tableClassName='min-w-[800px] table-fixed [&_th]:px-4 [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-3.5'
                  headerRowClassName='bg-muted/40 hover:bg-muted/40'
                  columns={[
                    {
                      id: 'enabled',
                      header: t('Status'),
                      className: 'w-[80px]',
                      cell: (rule) => (
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(val) =>
                            handleToggleRule(rule.id, val)
                          }
                        />
                      ),
                    },
                    {
                      id: 'name',
                      header: t('Rule Name'),
                      className: 'w-[180px]',
                      cell: (rule) => (
                        <div className='flex flex-col gap-0.5'>
                          <span className='font-medium text-sm'>
                            {rule.name}
                          </span>
                        </div>
                      ),
                    },
                    {
                      id: 'match_code',
                      header: t('Match Code'),
                      className: 'w-[110px]',
                      cell: (rule) => (
                        <Badge
                          variant={rule.match_code > 0 ? 'secondary' : 'outline'}
                        >
                          {rule.match_code > 0
                            ? rule.match_code
                            : t('Any (0)')}
                        </Badge>
                      ),
                    },
                    {
                      id: 'keywords',
                      header: t('Match Keywords'),
                      className: 'w-[260px]',
                      cell: (rule) => (
                        <TruncatedCell
                          tabIndex={0}
                          tooltipContent={rule.keywords}
                        >
                          <span className='font-mono text-xs text-muted-foreground'>
                            {rule.keywords || t('(Match all errors)')}
                          </span>
                        </TruncatedCell>
                      ),
                    },
                    {
                      id: 'replace_msg',
                      header: t('Sanitized Explanation'),
                      className: 'min-w-[240px]',
                      cell: (rule) => (
                        <TruncatedCell
                          tabIndex={0}
                          tooltipContent={rule.replace_msg}
                        >
                          <span className='text-sm'>{rule.replace_msg}</span>
                        </TruncatedCell>
                      ),
                    },
                    {
                      id: 'override_code',
                      header: t('Override Code'),
                      className: 'w-[110px]',
                      cell: (rule) => (
                        <Badge
                          variant={
                            rule.override_code > 0 ? 'secondary' : 'outline'
                          }
                        >
                          {rule.override_code > 0
                            ? rule.override_code
                            : t('Keep (0)')}
                        </Badge>
                      ),
                    },
                    {
                      id: 'actions',
                      header: '',
                      className: 'w-[90px] text-right',
                      cell: (rule) => (
                        <div className='flex items-center justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleOpenEdit(rule)}
                            aria-label={t('Edit')}
                          >
                            <Edit className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={() => handleDeleteRule(rule.id)}
                            className='text-destructive hover:text-destructive'
                            aria-label={t('Delete')}
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </TabsContent>

          {/* JSON Mode */}
          <TabsContent value='json' className='mt-4 space-y-3'>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Edit error mapping rules as JSON array. Changes sync with the visual editor.'
              )}
            </p>
            <JsonCodeEditor
              value={jsonValue}
              onChange={setJsonValue}
              placeholder='[{"name": "...", "keywords": "...", "replace_msg": "..."}]'
              heightClassName='h-[420px] min-h-[300px] max-h-[600px]'
              ariaLabel={t('Error Mapping Rules JSON')}
            />
          </TabsContent>
        </Tabs>

        {/* Rule Editor Dialog */}
        <Dialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title={editingRule ? t('Edit Error Rule') : t('Add Error Rule')}
          description={t(
            'Configure keywords and matching status code to intercept technical raw upstream errors and return a standardized user explanation.'
          )}
          footer={
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setIsDialogOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button onClick={handleSaveRule}>{t('Save Rule')}</Button>
            </div>
          }
        >
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='rule-name'>{t('Rule Name')}</Label>
              <Input
                id='rule-name'
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t('e.g. Model High Demand')}
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div className='grid gap-2'>
                <Label htmlFor='rule-match-code'>
                  {t('Match Status Code')}
                </Label>
                <Input
                  id='rule-match-code'
                  type='number'
                  value={draftMatchCode}
                  onChange={(e) => setDraftMatchCode(e.target.value)}
                  placeholder='0'
                />
                <span className='text-muted-foreground text-xs'>
                  {t('0 = Match any status code')}
                </span>
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='rule-override-code'>
                  {t('Override Status Code')}
                </Label>
                <Input
                  id='rule-override-code'
                  type='number'
                  value={draftOverrideCode}
                  onChange={(e) => setDraftOverrideCode(e.target.value)}
                  placeholder='0'
                />
                <span className='text-muted-foreground text-xs'>
                  {t('0 = Keep upstream code')}
                </span>
              </div>
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='rule-keywords'>{t('Match Keywords')}</Label>
              <Textarea
                id='rule-keywords'
                rows={3}
                value={draftKeywords}
                onChange={(e) => setDraftKeywords(e.target.value)}
                placeholder={t(
                  'Separate keywords with commas or newlines, e.g. currently experiencing high demand, high traffic'
                )}
              />
              <span className='text-muted-foreground text-xs'>
                {t(
                  'Case-insensitive substring match. Matches if ANY keyword is found.'
                )}
              </span>
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='rule-replace-msg'>
                {t('Sanitized Explanation')}
              </Label>
              <Textarea
                id='rule-replace-msg'
                rows={3}
                value={draftReplaceMsg}
                onChange={(e) => setDraftReplaceMsg(e.target.value)}
                placeholder={t(
                  'e.g. The upstream model is under heavy load, please retry later.'
                )}
              />
              <span className='text-muted-foreground text-xs'>
                {t(
                  'This explanation will be returned to the client as the sanitized cause.'
                )}
              </span>
            </div>

            <div className='flex items-center justify-between pt-2'>
              <Label htmlFor='rule-enabled'>{t('Enable this rule')}</Label>
              <Switch
                id='rule-enabled'
                checked={draftEnabled}
                onCheckedChange={setDraftEnabled}
              />
            </div>
          </div>
        </Dialog>

        {/* Restore Presets Confirmation Dialog */}
        <Dialog
          open={confirmRestoreOpen}
          onOpenChange={setConfirmRestoreOpen}
          title={t('Restore Preset Rules?')}
          description={t(
            'This will replace your current error rules with the 10 built-in default preset rules covering common production errors. Are you sure you want to proceed?'
          )}
          footer={
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setConfirmRestoreOpen(false)}
              >
                {t('Cancel')}
              </Button>
              <Button variant='destructive' onClick={handleRestorePresets}>
                {t('Confirm Restore')}
              </Button>
            </div>
          }
        >
          <p className='text-muted-foreground text-sm'>
            {t(
              'Preset rules include embeddings unsupport, sensitive content filter, high demand/traffic, 404 resource not found, quota/rate limits, and context length limits.'
            )}
          </p>
        </Dialog>
      </div>
    </SettingsSection>
  )
}
