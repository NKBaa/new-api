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

import { ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { COMPATIBLE_TOOLS } from '../constants'
import type { CompatibleTool } from '../types'

interface CompatibleToolsProps {
  apiBase: string
}

export function CompatibleTools({ apiBase }: CompatibleToolsProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = async (tool: CompatibleTool) => {
    const payload = `Base URL: ${apiBase}\nGuide: ${t(tool.configTip)}`
    const success = await copyToClipboard(payload)
    if (success) {
      setCopiedId(tool.id)
      toast.success(t('Copied configuration for {{name}}', { name: tool.name }))
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  return (
    <section className='py-12'>
      <div className='mx-auto max-w-6xl px-6'>
        <div className='mb-6 flex items-center justify-between'>
          <div>
            <h2 className='text-xl font-bold tracking-tight text-foreground font-mono sm:text-2xl'>
              {t('Supported Clients & Integrations')}
            </h2>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('Native support for popular developer tools and desktop clients right out of the box.')}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {COMPATIBLE_TOOLS.map((tool) => (
            <div
              key={tool.id}
              className='group rounded-lg border border-border bg-card p-4 hover:border-border/80 hover:bg-muted/30 transition-colors flex flex-col justify-between'
            >
              <div>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <span className='font-mono font-semibold text-foreground text-sm'>
                      {tool.name}
                    </span>
                    <span className='rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono'>
                      {tool.category}
                    </span>
                  </div>
                  <a
                    href={tool.website}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-muted-foreground hover:text-foreground transition-colors'
                  >
                    <ExternalLink className='size-3.5' />
                  </a>
                </div>
                <p className='mt-2 text-xs text-muted-foreground'>
                  {t(tool.tagline)}
                </p>
              </div>

              <div className='mt-4 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] font-mono'>
                <span className='text-muted-foreground truncate max-w-[200px]'>
                  {t(tool.configTip)}
                </span>
                <button
                  type='button'
                  onClick={() => handleCopy(tool)}
                  className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0'
                >
                  {copiedId === tool.id ? (
                    <Check className='size-3 text-emerald-500' />
                  ) : (
                    <Copy className='size-3' />
                  )}
                  <span>{copiedId === tool.id ? t('Copied') : t('Config')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
