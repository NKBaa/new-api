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

import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Copy, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

interface HeroProps {
  isAuthenticated?: boolean
  apiBase: string
  systemName: string
  docsUrl: string
  totalModelsCount: number
}

export function Hero({
  isAuthenticated,
  apiBase,
  systemName: _systemName,
  docsUrl,
  totalModelsCount,
}: HeroProps) {
  const { t } = useTranslation()
  const { isCopied, copyToClipboard } = useCopyToClipboard()

  const handleCopyEndpoint = async () => {
    const success = await copyToClipboard(apiBase)
    if (success) {
      toast.success(t('Copied Base URL to clipboard'))
    }
  }

  return (
    <section className='pt-16 pb-12 md:pt-24 md:pb-16'>
      <div className='mx-auto max-w-5xl px-6 text-center'>
        {/* OpenRouter 风格极简状态小标 */}
        <div className='inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground font-mono mb-6'>
          <span className='size-2 rounded-full bg-emerald-500' />
          <span>{t('All systems operational')}</span>
          <span className='text-border'>•</span>
          <span className='text-foreground/80 font-medium'>
            {totalModelsCount}+ {t('models online')}
          </span>
        </div>

        {/* 极简无浮夸的大标题 */}
        <h1 className='text-3xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl font-mono'>
          {t('A unified interface for LLMs')}
        </h1>

        {/* 副标题 */}
        <p className='mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg leading-relaxed'>
          {t(
            'One OpenAI-compatible endpoint to access leading AI models on demand with transparent token-based pricing.'
          )}
        </p>

        {/* 极速接入 Base URL 复制栏（动态绑定后台实际配置的域名） */}
        <div className='mx-auto mt-8 flex max-w-md items-center justify-between rounded-lg border border-border bg-card p-1.5 shadow-2xs'>
          <div className='flex items-center gap-2 pl-3 font-mono text-xs text-muted-foreground truncate'>
            <span className='text-foreground font-semibold'>API Base:</span>
            <span className='text-foreground/90 select-all truncate'>{apiBase}</span>
          </div>
          <Button
            size='sm'
            variant='secondary'
            onClick={handleCopyEndpoint}
            className='h-8 shrink-0 gap-1 text-xs font-mono'
          >
            {isCopied ? (
              <>
                <Check className='size-3.5 text-emerald-500' />
                <span>{t('Copied')}</span>
              </>
            ) : (
              <>
                <Copy className='size-3.5' />
                <span>{t('Copy')}</span>
              </>
            )}
          </Button>
        </div>

        {/* 极简按钮组 */}
        <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
          {isAuthenticated ? (
            <Button
              className='h-10 rounded-lg px-5 text-sm font-medium'
              render={<Link to='/dashboard' />}
            >
              <span>{t('Go to Dashboard')}</span>
              <ArrowRight className='ml-1.5 size-4' />
            </Button>
          ) : (
            <>
              <Button
                className='h-10 rounded-lg px-5 text-sm font-medium'
                render={<Link to='/sign-up' />}
              >
                <span>{t('Get API Key')}</span>
                <ArrowRight className='ml-1.5 size-4' />
              </Button>
              <Button
                variant='outline'
                className='h-10 rounded-lg px-5 text-sm font-medium'
                render={<Link to='/pricing' />}
              >
                <span>{t('Pricing')}</span>
              </Button>
            </>
          )}

          <Button
            variant='ghost'
            className='h-10 text-muted-foreground hover:text-foreground text-sm font-medium'
            render={
              <a
                href={docsUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center gap-1.5'
              />
            }
          >
            <BookOpen className='size-4' />
            <span>{t('Docs')}</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
