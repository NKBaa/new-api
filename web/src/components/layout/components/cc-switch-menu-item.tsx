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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { fetchChatKeyByTokenId } from '@/features/chat/hooks/use-active-chat-key'
import { useChatKeyPrompt } from '@/features/chat/hooks/use-chat-key-prompt'
import { useChatPresets } from '@/features/chat/hooks/use-chat-presets'
import { useCCSwitchImport } from '@/features/keys/components/cc-switch-import-provider'
import { handleServerError } from '@/lib/handle-server-error'

import type { NavCCSwitch } from '../types'

/**
 * Sidebar entry for importing this gateway into CC Switch.
 *
 * Same action as the API key row menu: ask which key to export, reveal it, then
 * hand it to the shared import dialog. It is a top-level item rather than a chat
 * preset sub-item because CC Switch is a client configuration target, not a
 * chat preset to navigate to.
 */
export function CCSwitchMenuItem(props: { item: NavCCSwitch }) {
  const { t } = useTranslation()
  const { requestKey } = useChatKeyPrompt()
  const { openImport } = useCCSwitchImport()
  const { chatPresets } = useChatPresets()

  // `setting/chat.go` publishes CC Switch as the bare `ccswitch` marker, which
  // the preset parser classifies as a generic custom protocol.
  const ccsPreset = chatPresets.find((preset) =>
    preset.url.toLowerCase().startsWith('ccswitch')
  )

  /** Reveal the picked token's secret, then open the import dialog with it. */
  const importWithKey = useCallback(
    async (tokenId: number) => {
      try {
        openImport(await fetchChatKeyByTokenId(tokenId))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t(
                'Unable to prepare chat link. Please ensure you have an enabled API key.'
              )
        handleServerError(error, message)
      }
    },
    [openImport, t]
  )

  const handleImport = useCallback(() => {
    if (!ccsPreset) return
    requestKey(
      ccsPreset,
      (tokenId) => void importWithKey(tokenId),
      t('Continue')
    )
  }, [ccsPreset, importWithKey, requestKey, t])

  // A deployment that dropped the CC Switch preset keeps the entry hidden.
  if (!ccsPreset) {
    return null
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={props.item.title} onClick={handleImport}>
        {props.item.icon && <props.item.icon className='shrink-0' />}
        <span className='min-w-0 flex-1 truncate'>{props.item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
