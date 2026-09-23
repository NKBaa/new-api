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
  ZoomIn,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import type { CustomerServiceItem } from '@/features/auth/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'

function CustomerServiceCard({ item }: { item: CustomerServiceItem }) {
  const { t } = useTranslation()
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const [zoomOpen, setZoomOpen] = useState(false)

  const handleCopy = async () => {
    if (!item.contact) return
    const ok = await copyToClipboard(item.contact)
    if (ok) {
      toast.success(t('Contact info copied to clipboard'))
    }
  }

  return (
    <>
      <div className='flex h-full w-full flex-1 flex-col justify-between rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs transition-all hover:border-border/80 hover:shadow-sm'>
        <div>
          {/* Card Header */}
          <div className='flex items-start justify-between gap-3'>
            <div className='flex items-center gap-3 min-w-0'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground shadow-2xs'>
                <Headset className='size-5 text-emerald-500' />
              </div>
              <div className='min-w-0 flex-1'>
                <h4 className='font-semibold text-base text-foreground tracking-tight truncate'>
                  {item.title}
                </h4>
                {item.contact && (
                  <div className='mt-0.5 font-mono text-xs text-muted-foreground select-all break-all'>
                    {item.contact}
                  </div>
                )}
              </div>
            </div>

            {item.contact && (
              <Button
                variant='ghost'
                size='icon'
                onClick={handleCopy}
                title={t('Copy contact info')}
                className='size-8 shrink-0 text-muted-foreground hover:text-foreground'
              >
                {isCopied ? (
                  <Check className='size-3.5 text-emerald-500' />
                ) : (
                  <Copy className='size-3.5' />
                )}
              </Button>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className='mt-3.5 text-xs leading-relaxed text-muted-foreground'>
              {item.description}
            </p>
          )}

          {/* QR Code Section */}
          {item.qrcode && item.qrcode.trim() !== '' && (
            <div className='mt-4 flex flex-col items-center justify-center rounded-lg border border-border bg-muted/20 p-3.5'>
              <button
                type='button'
                onClick={() => setZoomOpen(true)}
                className='group relative flex items-center justify-center rounded-lg overflow-hidden border border-border bg-white p-2.5 transition-transform hover:scale-102 focus:outline-none focus:ring-1 focus:ring-ring'
              >
                <img
                  src={item.qrcode}
                  alt={item.title}
                  className='size-40 object-contain'
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
                <div className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100'>
                  <ZoomIn className='size-5 text-white' />
                </div>
              </button>
              <div className='mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground'>
                <QrCode className='size-3 text-muted-foreground' />
                <span>{t('Click to enlarge and scan QR code')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        {item.link && item.link.trim() !== '' && (
          <div className='mt-5 pt-3.5 border-t border-border/60'>
            <Button
              variant='outline'
              size='sm'
              className='w-full gap-1.5 text-xs font-medium transition-colors hover:bg-accent'
              render={
                <a
                  href={item.link}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              <span>{t('Contact Now')}</span>
              <ExternalLink className='size-3 text-muted-foreground' />
            </Button>
          </div>
        )}
      </div>

      {/* QR Code Zoom Lightbox Dialog */}
      {item.qrcode && (
        <Dialog
          open={zoomOpen}
          onOpenChange={setZoomOpen}
          title={item.title}
          contentClassName='sm:max-w-sm text-center'
        >
          <div className='flex flex-col items-center justify-center py-2 space-y-3'>
            <div className='rounded-xl border border-border bg-white p-4 shadow-sm inline-block'>
              <img
                src={item.qrcode}
                alt={item.title}
                className='size-64 max-w-full object-contain'
              />
            </div>
            {item.contact && (
              <div className='font-mono text-sm font-medium text-foreground'>
                {item.contact}
              </div>
            )}
            {item.description && (
              <div className='text-xs text-muted-foreground max-w-xs'>
                {item.description}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}

export function CustomerService() {
  const { t } = useTranslation()
  const { status } = useStatus()

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

  // 核心自动优化：根据客服项数量动态自适应最优网格与居中排版
  // 1 项：居中单卡片（max-w-md），杜绝左倾大面积留白；
  // 2 项：双列居中（max-w-3xl，2 列）；
  // 3 项：三列平铺（max-w-5xl，3 列）；
  // 4 项：双列 2x2 对称网格（max-w-3xl，2 列）；
  // 5 项及以上：流式 Flex 居中换行，每行居中，最后一排不靠左死板排列。
  const count = rawItems.length
  let layoutContainerClass = 'mx-auto max-w-6xl flex flex-wrap justify-center gap-6'
  let itemWrapperClass = 'w-full sm:w-[320px] lg:w-[340px] flex flex-col'

  if (count === 1) {
    layoutContainerClass = 'mx-auto max-w-md flex justify-center'
    itemWrapperClass = 'w-full'
  } else if (count === 2) {
    layoutContainerClass = 'mx-auto max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-6'
    itemWrapperClass = 'w-full flex flex-col'
  } else if (count === 3) {
    layoutContainerClass = 'mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
    itemWrapperClass = 'w-full flex flex-col'
  } else if (count === 4) {
    layoutContainerClass = 'mx-auto max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-6'
    itemWrapperClass = 'w-full flex flex-col'
  }

  return (
    <section className='py-12 md:py-16 border-t border-border/40'>
      <div className='mx-auto max-w-6xl px-6'>
        <div className='text-center max-w-2xl mx-auto mb-10'>
          <div className='inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground mb-3 font-mono'>
            <Headset className='size-3.5 text-emerald-500' />
            <span>{t('Official Support')}</span>
          </div>
          <h2 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl font-mono'>
            {t('Customer Service & Support')}
          </h2>
          <p className='mt-2 text-sm text-muted-foreground leading-relaxed'>
            {t('Encountering account, payment, or API issues, or seeking enterprise solutions? Our technical support team is here to help.')}
          </p>
        </div>

        <div className={layoutContainerClass}>
          {rawItems.map((item) => (
            <div key={item.id} className={itemWrapperClass}>
              <CustomerServiceCard item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
