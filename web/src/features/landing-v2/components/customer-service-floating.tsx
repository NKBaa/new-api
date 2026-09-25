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
  Copy,
  Check,
  ExternalLink,
  Headset,
  QrCode,
  Sparkles,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import type { CustomerServiceItem } from '@/features/auth/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'

function isValidHttpUrl(url?: string): boolean {
  if (!url) return false
  const trimmed = url.trim().toLowerCase()
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

export function CustomerServiceFloating() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [modalOpen, setModalOpen] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const rawItems = useMemo(() => {
    return (status?.customer_service ?? status?.data?.customer_service) as
      | CustomerServiceItem[]
      | undefined
  }, [status])

  const isEnabled = Boolean(
    status?.customer_service_enabled ?? status?.data?.customer_service_enabled
  )

  if (!isEnabled || !rawItems || rawItems.length === 0) {
    return null
  }

  const handleCopy = async (id: number, text?: string) => {
    if (!text) return
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedId(id)
      toast.success(t('Contact info copied to clipboard'))
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  return (
    <TooltipProvider delay={150}>
      {/* Floating Trigger Button */}
      <div className='fixed bottom-6 right-6 z-40'>
        <Tooltip>
          <TooltipTrigger render={
            <Button
              size='icon'
              onClick={() => setModalOpen(true)}
              className='size-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-ring border border-border/60'
              aria-label={t('Online Support')}
            >
              <Headset className='size-5' />
            </Button>
          } />
          <TooltipContent side='left'>
            <div className='flex items-center gap-1.5 text-xs font-medium'>
              <Sparkles className='size-3 text-emerald-500' />
              <span>{t('Customer Service & Support')}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Customer Service Dialog */}
      <Dialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={t('Online Customer Service & Tech Support')}
        contentClassName='sm:max-w-lg'
        contentHeight='auto'
        bodyClassName='space-y-4 max-h-[75vh] overflow-y-auto pr-1'
      >
        <p className='text-xs text-muted-foreground leading-relaxed'>
          {t('For billing, API troubleshooting, or enterprise requests, feel free to reach out via our official channels.')}
        </p>

        <div className='space-y-3'>
          {rawItems.map((item) => (
            <div
              key={item.id}
              className='rounded-xl border border-border bg-muted/20 p-4 transition-all hover:bg-muted/30'
            >
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-center gap-2.5'>
                  <div className='flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-emerald-500'>
                    <Headset className='size-4' />
                  </div>
                  <div>
                    <h5 className='font-semibold text-sm text-foreground'>
                      {item.title}
                    </h5>
                    {item.contact && (
                      <div className='font-mono text-xs text-muted-foreground mt-0.5 select-all'>
                        {item.contact}
                      </div>
                    )}
                  </div>
                </div>

                <div className='flex items-center gap-1 shrink-0'>
                  {item.contact && (
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8 text-muted-foreground hover:text-foreground'
                      onClick={() => handleCopy(item.id, item.contact)}
                      title={t('Copy contact info')}
                    >
                      {copiedId === item.id ? (
                        <Check className='size-3.5 text-emerald-500' />
                      ) : (
                        <Copy className='size-3.5' />
                      )}
                    </Button>
                  )}
                  {isValidHttpUrl(item.link) && (
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-8 text-muted-foreground hover:text-foreground'
                      render={
                        <a
                          href={item.link}
                          target='_blank'
                          rel='noopener noreferrer'
                        />
                      }
                      title={t('Open link')}
                    >
                      <ExternalLink className='size-3.5' />
                    </Button>
                  )}
                </div>
              </div>

              {item.description && (
                <p className='mt-2 text-xs leading-relaxed text-muted-foreground pl-10'>
                  {item.description}
                </p>
              )}

              {/* QR Code thumbnail / preview */}
              {item.qrcode && item.qrcode.trim() !== '' && (
                <div className='mt-3 flex items-center justify-center rounded-lg border border-border bg-white dark:bg-black/30 p-3'>
                  <div className='text-center'>
                    <img
                      src={item.qrcode}
                      alt={item.title}
                      className='size-36 max-w-full object-contain mx-auto rounded'
                      onError={(e) => {
                        ;(e.target as HTMLElement).style.display = 'none'
                      }}
                    />
                    <div className='mt-1.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground'>
                      <QrCode className='size-3' />
                      <span>{t('Scan via WeChat or mobile camera')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Dialog>
    </TooltipProvider>
  )
}
