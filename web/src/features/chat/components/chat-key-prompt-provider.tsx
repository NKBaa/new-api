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
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { useSidebar } from '@/components/ui/sidebar'
import { ChatKeyDialog } from '@/features/chat/components/chat-key-dialog'
import {
  ChatKeyPromptContext,
  type ChatKeyPromptHandle,
} from '@/features/chat/hooks/use-chat-key-prompt'
import type { ChatPreset } from '@/features/chat/lib/chat-links'
import { useChatKeyPreferenceStore } from '@/stores/chat-key-preference-store'

/** The preset awaiting a key plus how its launch should be completed. */
type ChatKeyRequest = {
  preset: ChatPreset
  /** Set by callers that resolve the link themselves instead of navigating. */
  onPick?: (tokenId: number) => void
}

/**
 * Hosts the chat API key picker above the sidebar.
 *
 * Mounted outside the sidebar so the dialog is not nested inside the mobile
 * navigation sheet, which would suppress its backdrop and stack below it.
 */
export function ChatKeyPromptProvider(props: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const setLastTokenId = useChatKeyPreferenceStore(
    (state) => state.setLastTokenId
  )
  const [request, setRequest] = useState<ChatKeyRequest | null>(null)

  const handle = useMemo<ChatKeyPromptHandle>(
    () => ({
      requestKey: (target, onPick) => {
        // The mobile sidebar sheet stacks above the dialog, so close it first.
        setOpenMobile(false)
        setRequest({ preset: target, onPick })
      },
    }),
    [setOpenMobile]
  )

  const handleConfirm = useCallback(
    (tokenId: number) => {
      setLastTokenId(tokenId)
      const target = request
      setRequest(null)
      if (!target) return

      if (target.onPick) {
        target.onPick(tokenId)
        return
      }

      void navigate({
        to: '/chat/$chatId',
        params: { chatId: target.preset.id },
        search: { key: tokenId },
      })
    },
    [navigate, request, setLastTokenId]
  )

  return (
    <ChatKeyPromptContext.Provider value={handle}>
      {props.children}
      <ChatKeyDialog
        key={request?.preset.id ?? 'none'}
        preset={request?.preset ?? null}
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) setRequest(null)
        }}
        onConfirm={handleConfirm}
      />
    </ChatKeyPromptContext.Provider>
  )
}
