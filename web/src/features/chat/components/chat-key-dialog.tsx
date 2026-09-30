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
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useEnabledChatKeys } from '@/features/chat/hooks/use-active-chat-key'
import type { ChatPreset } from '@/features/chat/lib/chat-links'
import { useChatKeyPreferenceStore } from '@/stores/chat-key-preference-store'

interface Props {
  /** Preset the user asked to launch; `null` renders the empty dialog shell. */
  preset: ChatPreset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (tokenId: number) => void
}

/**
 * Key picker shown before a chat preset that needs an API key is launched.
 *
 * Preselects the token used last time, falling back to the first enabled one,
 * so repeat launches stay a single click.
 */
export function ChatKeyDialog(props: Props) {
  const { t } = useTranslation()
  const [pickedTokenId, setPickedTokenId] = useState<number | null>(null)
  const lastTokenId = useChatKeyPreferenceStore((state) => state.lastTokenId)

  const keysQuery = useEnabledChatKeys(props.open)
  const enabledKeys = keysQuery.data

  const selectedTokenId = useMemo(() => {
    const items = enabledKeys ?? []
    if (items.length === 0) return null

    const preferred = pickedTokenId ?? lastTokenId
    if (preferred !== null && items.some((item) => item.id === preferred)) {
      return preferred
    }

    return items[0].id
  }, [enabledKeys, lastTokenId, pickedTokenId])

  let body = null
  if (keysQuery.isPending) {
    body = <LoadingState className='min-h-0 py-6' />
  } else if (keysQuery.isError) {
    body = (
      <ErrorState
        className='min-h-0 py-6'
        title={t('Unable to load API keys')}
        description={
          keysQuery.error instanceof Error ? keysQuery.error.message : undefined
        }
        onRetry={() => void keysQuery.refetch()}
      />
    )
  } else if ((enabledKeys ?? []).length === 0) {
    body = (
      <EmptyState
        className='min-h-0 py-6'
        title={t('No enabled API keys')}
        description={t(
          'Create or enable an API key before launching this chat client.'
        )}
        action={
          <Button
            variant='outline'
            size='sm'
            render={<Link to='/keys' />}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Go to API Keys')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <RadioGroup
        aria-label={t('API Key')}
        value={selectedTokenId === null ? '' : String(selectedTokenId)}
        onValueChange={(value) => setPickedTokenId(Number(value))}
      >
        {(enabledKeys ?? []).map((item) => (
          <div key={item.id} className='flex items-center gap-2'>
            <RadioGroupItem
              value={String(item.id)}
              id={`chat-key-${item.id}`}
            />
            <Label
              htmlFor={`chat-key-${item.id}`}
              className='min-w-0 flex-1 cursor-pointer'
            >
              <span className='min-w-0 flex-1 truncate'>{item.name}</span>
              <span className='text-muted-foreground font-mono text-xs'>
                sk-{item.key}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Select API Key')}
      description={
        props.preset
          ? t('Choose the API key to use with {{name}}.', {
              name: props.preset.name,
            })
          : undefined
      }
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={selectedTokenId === null}
            onClick={() => {
              if (selectedTokenId === null) return
              props.onConfirm(selectedTokenId)
            }}
          >
            {t('Confirm & Launch')}
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  )
}
