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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  CreditCard,
  FileText,
  KeyRound,
  ListChecks,
  RadioTower,
  ShieldCheck,
  TerminalSquare,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getUserModels } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { MOTION_TRANSITION } from '@/lib/motion'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  useApiInfo,
  useDashboardContentVisibility,
} from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { FAQPanel } from './faq-panel'
import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'
import { UptimePanel } from './uptime-panel'

const SETUP_GUIDE_VISIBILITY_STORAGE_KEY =
  'dashboard_overview_setup_guide_expanded'

const SETUP_GUIDE_CODE_PATTERN = [
  'const request = await client.responses.create({',
  "  model: 'gpt-4.1-mini',",
  "  input: 'Start routing traffic',",
  '})',
  '',
  'if (request.output_text) {',
  '  console.log(request.output_text)',
  '}',
].join('\n')

type DashboardActionPath =
  | '/keys'
  | '/wallet'
  | '/playground'
  | '/channels'
  | '/usage-logs'
  | '/pricing'

interface StartStep {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  completed: boolean
}

interface QuickAction {
  title: string
  description: string
  to: DashboardActionPath
  icon: LucideIcon
  adminOnly?: boolean
}

interface RequestExample {
  endpoint: string
  model: string
  keyName: string
  keyId?: number
  displayKey: string
  ready: boolean
}

interface HeroSignal {
  label: string
  value: string
  icon: LucideIcon
  tone: IconBadgeTone
}

function getSavedSetupGuideExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  const saved = window.localStorage.getItem(SETUP_GUIDE_VISIBILITY_STORAGE_KEY)
  if (saved === 'expanded') return true
  if (saved === 'collapsed') return false
  return null
}

function saveSetupGuideExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    SETUP_GUIDE_VISIBILITY_STORAGE_KEY,
    expanded ? 'expanded' : 'collapsed'
  )
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function normalizeEndpoint(sourceUrl?: string): string {
  const fallback = `${getCurrentOrigin()}/v1/chat/completions`
  const trimmed = sourceUrl?.trim()
  if (!trimmed) return fallback

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlash.endsWith('/v1/chat/completions')) {
    return withoutTrailingSlash
  }
  if (withoutTrailingSlash.endsWith('/v1')) {
    return `${withoutTrailingSlash}/chat/completions`
  }
  return `${withoutTrailingSlash}/v1/chat/completions`
}

function getPreferredKey(keys: ApiKey[]): ApiKey | null {
  return keys.find((item) => item.status === 1) ?? keys[0] ?? null
}

function formatDisplayKey(key?: string): string {
  if (!key) return 'sk-...'
  if (key.length <= 14) return key
  return `${key.slice(0, 7)}...${key.slice(-4)}`
}

function buildCurlCommand(args: {
  endpoint: string
  apiKey: string
  model: string
}): string {
  return [
    `curl ${args.endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${args.apiKey}" \\`,
    "  -d '{",
    `    "model": "${args.model}",`,
    '    "messages": [{"role": "user", "content": "Hello!"}]',
    "  }'",
  ].join('\n')
}

type ClientTab = 'curl' | 'python' | 'cursor' | 'cherry' | 'claude'

function buildClientSnippet(args: {
  tab: ClientTab
  endpoint: string
  apiKey: string
  model: string
}): string {
  const base = args.endpoint.replace(/\/chat\/completions$/, '')
  switch (args.tab) {
    case 'python':
      return [
        'from openai import OpenAI',
        '',
        'client = OpenAI(',
        `    base_url="${base}",`,
        `    api_key="${args.apiKey}",`,
        ')',
        '',
        'response = client.chat.completions.create(',
        `    model="${args.model}",`,
        '    messages=[{"role": "user", "content": "Hello!"}],',
        ')',
        'print(response.choices[0].message.content)',
      ].join('\n')
    case 'cursor':
      return [
        `Base URL: ${base}`,
        `API Key: ${args.apiKey}`,
        `Model: ${args.model}`,
      ].join('\n')
    case 'cherry':
      return [
        `API 域名: ${base}`,
        `API 密钥: ${args.apiKey}`,
        `推荐模型: ${args.model}`,
      ].join('\n')
    case 'claude':
      return [
        `export ANTHROPIC_BASE_URL="${base}"`,
        `export ANTHROPIC_API_KEY="${args.apiKey}"`,
      ].join('\n')
    case 'curl':
    default:
      return buildCurlCommand(args)
  }
}

function SetupGuideBackdrop(props: { compact?: boolean }) {
  return (
    <>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-muted/20 dark:bg-card/40',
          props.compact ? 'opacity-40' : 'opacity-70'
        )}
        aria-hidden='true'
      />
      <div
        className={cn(
          'text-foreground/5 dark:text-foreground/5 pointer-events-none absolute inset-y-0 right-0 hidden overflow-hidden font-mono sm:block',
          props.compact ? 'w-1/2 opacity-30' : 'w-[58%] opacity-50'
        )}
        aria-hidden='true'
      >
        <pre
          className={cn(
            'absolute right-3 [mask-image:linear-gradient(90deg,transparent_0%,black_30%,black_82%,transparent_100%)] text-right tracking-[0.38em] whitespace-pre',
            props.compact
              ? '-top-6 text-[9px] leading-4'
              : 'top-1 text-[11px] leading-5'
          )}
        >
          {SETUP_GUIDE_CODE_PATTERN}
        </pre>
      </div>
    </>
  )
}

function StartStepItem(props: {
  step: StartStep
  index: number
  isLast: boolean
}) {
  const Icon = props.step.icon
  const StatusIcon = props.step.completed ? Check : Circle

  return (
    <li className='relative flex gap-3 pb-2.5 last:pb-0'>
      {!props.isLast && (
        <span
          className='bg-border absolute top-9 bottom-0 left-4 w-px'
          aria-hidden='true'
        />
      )}
      <span
        className={cn(
          'bg-background relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-xs',
          props.step.completed && 'border-success/30 bg-success/10'
        )}
      >
        <StatusIcon
          className={props.step.completed ? 'text-success size-4' : 'size-4'}
          aria-hidden='true'
        />
      </span>

      <Link
        to={props.step.to}
        className='bg-background/70 hover:bg-muted/50 focus-visible:ring-ring flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left shadow-xs transition-colors outline-none focus-visible:ring-2'
      >
        <span className='flex min-w-0 items-start gap-2.5'>
          <span className='bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg'>
            <Icon className='size-3.5' aria-hidden='true' />
          </span>
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='flex items-center gap-2 text-sm font-medium'>
              <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                {props.index + 1}.
              </span>
              <span className='truncate'>{props.step.title}</span>
            </span>
            <span className='text-muted-foreground line-clamp-1 text-xs'>
              {props.step.description}
            </span>
          </span>
        </span>
        <ArrowRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Link>
    </li>
  )
}

const CLIENT_TAB_LABELS: Record<ClientTab, string> = {
  curl: 'Bash',
  python: 'Python 3',
  cursor: 'Cursor',
  cherry: 'Cherry',
  claude: 'Claude Code',
}

function RequestPreview(props: {
  example: RequestExample
  signals: HeroSignal[]
}) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<ClientTab>('curl')
  const [isCopying, setIsCopying] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const previewSnippet = useMemo(() => {
    return buildClientSnippet({
      tab: activeTab,
      endpoint: props.example.endpoint,
      apiKey: props.example.displayKey,
      model: props.example.model,
    })
  }, [activeTab, props.example.endpoint, props.example.displayKey, props.example.model])

  const handleCopyRequest = async () => {
    if (isCopying) return

    setIsCopying(true)
    try {
      let realKey = ''
      if (props.example.keyId) {
        const result = await fetchTokenKey(props.example.keyId)
        if (result.success && result.data?.key) {
          realKey = `sk-${result.data.key}`
        }
      }
      if (!realKey) {
        realKey = props.example.displayKey || 'sk-your-api-key'
      }

      const snippetToCopy = buildClientSnippet({
        tab: activeTab,
        endpoint: props.example.endpoint,
        apiKey: realKey,
        model: props.example.model,
      })
      const copied = await copyToClipboard(snippetToCopy)
      if (copied) {
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    } finally {
      setIsCopying(false)
    }
  }

  const clientTabs: { key: ClientTab; label: string }[] = [
    { key: 'curl', label: 'cURL' },
    { key: 'python', label: 'Python' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'cherry', label: 'Cherry' },
    { key: 'claude', label: 'Claude Code' },
  ]

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={MOTION_TRANSITION.slow}
      className='bg-background/85 relative overflow-hidden rounded-2xl border border-border p-3 shadow-xs backdrop-blur'
    >
      <div className='flex items-center justify-between gap-3 border-b border-border/50 pb-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <IconBadge tone='info'>
            <TerminalSquare />
          </IconBadge>
          <div className='min-w-0'>
            <div className='truncate text-sm font-semibold font-mono'>
              {t('Developer Quickstart')}
            </div>
            <div className='text-muted-foreground truncate text-xs font-mono'>
              {props.example.ready
                ? props.example.keyName
                : t('Create an API key to unlock the real request')}
            </div>
          </div>
        </div>
        {props.example.ready ? (
          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1.5 px-2 text-xs font-mono'
            disabled={isCopying}
            onClick={handleCopyRequest}
            aria-label={t('Copy ready-to-run config')}
          >
            <Copy data-icon='inline-start' />
            {isCopying ? t('Loading') : t('Copy')}
          </Button>
        ) : (
          <Button size='sm' variant='outline' render={<Link to='/keys' />}>
            {t('Create API Key')}
          </Button>
        )}
      </div>

      {/* 极简客户端切换标签栏 */}
      <div className='flex items-center gap-1 overflow-x-auto pb-1 mt-3 font-mono text-[11px] border-b border-border/40'>
        {clientTabs.map((item) => (
          <button
            key={item.key}
            type='button'
            onClick={() => setActiveTab(item.key)}
            className={cn(
              'rounded px-2 py-0.5 transition-colors cursor-pointer whitespace-nowrap',
              activeTab === item.key
                ? 'bg-foreground text-background font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className='my-3 rounded-lg border border-border/50 bg-foreground/[0.03] p-3 font-mono text-xs'>
        <div className='mb-2 flex items-center justify-between border-b border-border/40 pb-2 text-[10px] text-muted-foreground'>
          <div className='flex items-center gap-1.5'>
            <span className='bg-destructive/80 size-2 rounded-full' />
            <span className='bg-warning/80 size-2 rounded-full' />
            <span className='bg-success/80 size-2 rounded-full' />
          </div>
          <span className='uppercase font-semibold tracking-wider opacity-70'>
            {CLIENT_TAB_LABELS[activeTab]}
          </span>
        </div>
        <pre className='overflow-x-auto min-h-[145px] max-h-60 select-all font-mono text-xs text-muted-foreground/90 leading-relaxed whitespace-pre'>
          <code>{previewSnippet}</code>
        </pre>
      </div>

      <div className='grid gap-2'>
        {props.signals.map((signal) => {
          const Icon = signal.icon

          return (
            <div
              key={signal.label}
              className='bg-muted/40 flex items-center justify-between gap-3 rounded-xl px-3 py-2'
            >
              <span className='flex min-w-0 items-center gap-2'>
                <IconBadge tone={signal.tone} size='xs'>
                  <Icon />
                </IconBadge>
                <span className='truncate text-xs font-medium'>
                  {signal.label}
                </span>
              </span>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {signal.value}
              </span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function QuickActionItem(props: { action: QuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='outline'
      className='h-auto justify-start rounded-xl px-3 py-3 text-left'
      render={<Link to={props.action.to} />}
    >
      <span className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
        <Icon className='size-4' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate text-sm font-medium'>
          {props.action.title}
        </span>
        <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
          {props.action.description}
        </span>
      </span>
    </Button>
  )
}

function CompactQuickAction(props: { action: QuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='outline'
      size='sm'
      className='bg-background/70 h-8 min-w-24 gap-1.5 px-2.5'
      render={<Link to={props.action.to} />}
    >
      <Icon data-icon='inline-start' />
      <span>{props.action.title}</span>
    </Button>
  )
}

export function OverviewDashboard() {
  const { t } = useTranslation()
  const setupGuideId = useId()
  const setupGuideToggleRef = useRef<HTMLButtonElement>(null)
  const user = useAuthStore((state) => state.auth.user)
  const { items: apiInfoItems } = useApiInfo()
  const {
    apiInfo: showApiInfoPanel,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()
  const [manualSetupGuideExpanded, setManualSetupGuideExpanded] = useState<
    boolean | null
  >(() => getSavedSetupGuideExpanded())

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () => {
      const result = requireServerSuccess(await getApiKeys({ p: 1, size: 10 }))
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })

  const modelsQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'user-models'],
    queryFn: async () => {
      const result = requireServerSuccess(await getUserModels())
      return result.success ? (result.data ?? []) : []
    },
    staleTime: 5 * 60 * 1000,
  })

  const preferredKey = useMemo(
    () => getPreferredKey(apiKeysQuery.data ?? []),
    [apiKeysQuery.data]
  )

  const startSteps = useMemo<StartStep[]>(
    () => [
      {
        title: t('Create API Key'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
        completed: Boolean(preferredKey),
      },
      {
        title: t('Add credits'),
        description: t('Keep enough balance before production traffic'),
        to: '/wallet',
        icon: CreditCard,
        completed: remainQuota > 0 || usedQuota > 0,
      },
      {
        title: t('Send a request'),
        description: t('Verify routing with Playground or your client'),
        to: '/playground',
        icon: TerminalSquare,
        completed: requestCount > 0,
      },
    ],
    [preferredKey, remainQuota, requestCount, t, usedQuota]
  )

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        title: t('API Keys'),
        description: t('Create a key for your app or service'),
        to: '/keys',
        icon: KeyRound,
      },
      {
        title: t('Channels'),
        description: t('Configure upstream providers and routing.'),
        to: '/channels',
        icon: RadioTower,
        adminOnly: true,
      },
      {
        title: t('Usage Logs'),
        description: t('Inspect requests, errors, and billing details'),
        to: '/usage-logs',
        icon: FileText,
      },
      {
        title: t('Pricing'),
        description: t('Review model rates before scaling traffic'),
        to: '/pricing',
        icon: BookOpen,
      },
    ],
    [t]
  )

  const visibleQuickActions = useMemo(
    () => quickActions.filter((action) => !action.adminOnly || isAdmin),
    [isAdmin, quickActions]
  )

  const heroSignals = useMemo<HeroSignal[]>(
    () => [
      {
        label: t('Route active'),
        value: apiInfoItems.length > 0 ? t('Online') : t('Current domain'),
        icon: RadioTower,
        tone: 'info',
      },
      {
        label: t('Auth configured'),
        value: preferredKey ? t('Secured') : t('Needs API key'),
        icon: ShieldCheck,
        tone: 'success',
      },
      {
        label: t('Model selected'),
        value: modelsQuery.data?.[0] ?? t('Loading'),
        icon: Timer,
        tone: 'chart-4',
      },
    ],
    [apiInfoItems.length, modelsQuery.data, preferredKey, t]
  )

  const requestExample = useMemo<RequestExample>(() => {
    const endpoint = normalizeEndpoint(apiInfoItems[0]?.url)
    const model = modelsQuery.data?.[0] ?? 'gpt-4o-mini'
    const keyName = preferredKey?.name ?? t('No API key yet')
    const ready = Boolean(preferredKey?.id && model)

    return {
      endpoint,
      model,
      keyName,
      keyId: preferredKey?.id,
      displayKey: preferredKey
        ? formatDisplayKey(`sk-${preferredKey.key}`)
        : 'sk-...',
      ready,
    }
  }, [apiInfoItems, modelsQuery.data, preferredKey, t])

  const completedStepCount = startSteps.filter((step) => step.completed).length
  const setupComplete = completedStepCount === startSteps.length
  const setupStatusReady = apiKeysQuery.isFetched && Boolean(user)
  const setupGuideExpanded =
    manualSetupGuideExpanded ?? (setupStatusReady && !setupComplete)
  const showLeftContentPanels =
    isAdmin || showApiInfoPanel || showAnnouncementsPanel || showFAQPanel
  const showContentPanels = showLeftContentPanels || showUptimePanel

  const handleSetupGuideToggle = () => {
    const nextExpanded = !setupGuideExpanded
    setManualSetupGuideExpanded(nextExpanded)
    saveSetupGuideExpanded(nextExpanded)
    if (!nextExpanded && setupComplete) {
      setupGuideToggleRef.current?.focus()
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Overview')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {setupStatusReady && setupComplete && (
          <Button
            ref={setupGuideToggleRef}
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-foreground h-auto min-h-7 max-w-[60vw] whitespace-normal'
            aria-expanded={setupGuideExpanded}
            aria-controls={setupGuideId}
            onClick={handleSetupGuideToggle}
          >
            {t('Setup guide')}
          </Button>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div id={setupGuideId} hidden={!setupGuideExpanded}>
            {setupGuideExpanded && (
              <CardStaggerContainer className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
                <CardStaggerItem className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
                  <div className='relative h-full overflow-hidden p-4 sm:p-5'>
                    <SetupGuideBackdrop />
                    <div className='relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]'>
                      <div className='flex min-w-0 flex-col gap-5'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                          <div className='flex max-w-2xl flex-col gap-1'>
                            <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase'>
                              <ListChecks
                                className='size-3.5'
                                aria-hidden='true'
                              />
                              {t('Get started')}
                            </div>
                            <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                              {t('Build on your API gateway in minutes')}
                            </h3>
                            <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
                              {t(
                                'A focused home for keys, balance, routing, and service health.'
                              )}
                            </p>
                            <div className='mt-2.5 flex max-w-md items-center justify-between gap-3 rounded-md border border-border/80 bg-muted/20 px-3 py-1.5 font-mono text-xs shadow-2xs'>
                              <div className='flex items-center gap-2 min-w-0 flex-1'>
                                <span className='shrink-0 text-foreground font-semibold font-mono tracking-normal text-xs'>
                                  API Base:
                                </span>
                                <span className='text-muted-foreground select-all truncate font-mono text-xs'>
                                  {requestExample.endpoint.replace(/\/chat\/completions$/, '')}
                                </span>
                              </div>
                              <button
                                type='button'
                                onClick={() => {
                                  copyToClipboard(requestExample.endpoint.replace(/\/chat\/completions$/, ''))
                                  toast.success(t('Copied to clipboard'))
                                }}
                                className='shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer'
                              >
                                {t('Copy')}
                              </button>
                            </div>
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              aria-expanded={setupGuideExpanded}
                              aria-controls={setupGuideId}
                              onClick={handleSetupGuideToggle}
                            >
                              <ChevronUp data-icon='inline-start' />
                              {t('Hide setup guide')}
                            </Button>
                            <Button size='sm' render={<Link to='/keys' />}>
                              <KeyRound data-icon='inline-start' />
                              {t('Create API Key')}
                            </Button>
                          </div>
                        </div>

                        <ol className='bg-background/45 rounded-2xl border p-2 backdrop-blur'>
                          {startSteps.map((step, index) => (
                            <StartStepItem
                              key={step.title}
                              step={step}
                              index={index}
                              isLast={index === startSteps.length - 1}
                            />
                          ))}
                        </ol>
                      </div>

                      <RequestPreview
                        example={requestExample}
                        signals={heroSignals}
                      />
                    </div>
                  </div>
                </CardStaggerItem>

                <CardStaggerItem className='bg-card h-full rounded-2xl border p-4 shadow-xs sm:p-5'>
                  <div className='flex h-full flex-col gap-4'>
                    <div className='flex flex-col gap-1'>
                      <div className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                        {t('Recommended actions')}
                      </div>
                      <h3 className='text-lg font-semibold tracking-tight'>
                        {t('Keep the platform ready')}
                      </h3>
                    </div>
                    <div className='grid gap-2'>
                      {visibleQuickActions.map((action) => (
                        <QuickActionItem key={action.title} action={action} />
                      ))}
                    </div>
                  </div>
                </CardStaggerItem>
              </CardStaggerContainer>
            )}
          </div>
          {!setupGuideExpanded && !setupComplete && (
            <CardStaggerContainer>
              <CardStaggerItem className='bg-card overflow-hidden rounded-2xl border shadow-xs'>
                <div className='relative overflow-hidden px-4 py-3 sm:px-5'>
                  <SetupGuideBackdrop compact />
                  <div className='relative flex flex-wrap items-center justify-between gap-3'>
                    <div className='flex min-w-0 items-center gap-3'>
                      <span className='bg-background/70 flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-xs'>
                        <Check
                          className='text-success size-4'
                          aria-hidden='true'
                        />
                      </span>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <h3 className='truncate text-sm font-semibold'>
                            {t('Setup guide')}
                          </h3>
                          <span className='text-muted-foreground bg-background/60 rounded-md border px-2 py-0.5 text-xs'>
                            {t('Setup progress: {{completed}}/{{total}}', {
                              completed: completedStepCount,
                              total: startSteps.length,
                            })}
                          </span>
                        </div>
                        <p className='text-muted-foreground line-clamp-1 text-xs'>
                          {t('Setup guide is collapsed. Expand it anytime.')}
                        </p>
                      </div>
                    </div>

                    <div className='flex flex-wrap items-center gap-2'>
                      {visibleQuickActions.map((action) => (
                        <CompactQuickAction
                          key={action.title}
                          action={action}
                        />
                      ))}
                      <Button
                        variant='outline'
                        size='sm'
                        className='bg-background/70 h-8 min-w-28'
                        aria-expanded={setupGuideExpanded}
                        aria-controls={setupGuideId}
                        onClick={handleSetupGuideToggle}
                      >
                        <ChevronDown data-icon='inline-start' />
                        {t('Show setup guide')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardStaggerItem>
            </CardStaggerContainer>
          )}

          <SummaryCards />

          {showContentPanels && (
            <CardStaggerContainer
              className={cn(
                'grid grid-cols-1 gap-4',
                showLeftContentPanels &&
                  showUptimePanel &&
                  'xl:grid-cols-[minmax(0,1fr)_22rem]'
              )}
            >
              {showLeftContentPanels && (
                <div
                  className={cn(
                    'grid min-w-0 grid-cols-1 gap-4',
                    (showApiInfoPanel ||
                      showAnnouncementsPanel ||
                      showFAQPanel) &&
                      'lg:grid-cols-2'
                  )}
                >
                  {isAdmin && (
                    <CardStaggerItem className='lg:col-span-2'>
                      <PerformanceHealthPanel />
                    </CardStaggerItem>
                  )}
                  {showApiInfoPanel && (
                    <CardStaggerItem>
                      <ApiInfoPanel />
                    </CardStaggerItem>
                  )}
                  {showAnnouncementsPanel && (
                    <CardStaggerItem>
                      <AnnouncementsPanel />
                    </CardStaggerItem>
                  )}
                  {showFAQPanel && (
                    <CardStaggerItem>
                      <FAQPanel />
                    </CardStaggerItem>
                  )}
                </div>
              )}
              {showUptimePanel && (
                <CardStaggerItem>
                  <UptimePanel />
                </CardStaggerItem>
              )}
            </CardStaggerContainer>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
