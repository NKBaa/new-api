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
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { fetchChatKeyByTokenId } from '@/features/chat/hooks/use-active-chat-key'
import { useChatKeyPrompt } from '@/features/chat/hooks/use-chat-key-prompt'
import type { ChatPreset } from '@/features/chat/lib/chat-links'
import { useCCSwitchImport } from '@/features/keys/components/cc-switch-import-provider'
import { handleServerError } from '@/lib/handle-server-error'

import type { NavCCSwitch } from '../types'

/**
 * Sidebar entry for importing this gateway into CC Switch.
 *
 * Same action as the API key row menu: ask which key to export, reveal it, then
 * hand it to the shared import dialog. CC Switch is a client configuration
 * target rather than a chat preset, so this entry deliberately does not read the
 * admin-editable `Chats` list: removing the `ccswitch` preset there must not make
 * the entry vanish, and keeping it must not produce a second entry.
 */
export function CCSwitchMenuItem(props: { item: NavCCSwitch }) {
  const { t } = useTranslation()
  const { requestKey } = useChatKeyPrompt()
  const { openImport } = useCCSwitchImport()

  // The picker only reads `name` for its description text, so derive it from the
  // already-translated nav title instead of looking it up in `Chats`.
  const preset = useMemo<ChatPreset>(
    () => ({
      id: 'cc-switch',
      name: props.item.title,
      url: 'ccswitch',
      type: 'custom-protocol',
    }),
    [props.item.title]
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
    requestKey(preset, (tokenId) => void importWithKey(tokenId), t('Continue'))
  }, [preset, importWithKey, requestKey, t])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={props.item.title} onClick={handleImport}>
        {props.item.icon && <props.item.icon className='shrink-0' />}
        <span className='min-w-0 flex-1 truncate'>{props.item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
