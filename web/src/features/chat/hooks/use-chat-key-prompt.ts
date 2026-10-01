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
import { createContext, useContext } from 'react'

import type { ChatPreset } from '@/features/chat/lib/chat-links'

export type ChatKeyPromptHandle = {
  /**
   * Ask which API key `preset` should be launched with.
   *
   * Without `onPick` the picker takes over the launch: it navigates to the web
   * preset on confirm and remembers the selected token for the next launch.
   * Callers that resolve the link themselves (custom-protocol presets) pass
   * `onPick` and launch from there; dismissing the picker leaves the current
   * route untouched in both cases.
   *
   * `confirmLabel` overrides the confirm button for callers whose action is not
   * a launch (for example importing the key into CC Switch).
   */
  requestKey: (
    preset: ChatPreset,
    onPick?: (tokenId: number) => void,
    confirmLabel?: string
  ) => void
}

export const ChatKeyPromptContext = createContext<ChatKeyPromptHandle | null>(
  null
)

export function useChatKeyPrompt(): ChatKeyPromptHandle {
  const handle = useContext(ChatKeyPromptContext)
  if (!handle) {
    throw new Error(
      'useChatKeyPrompt must be used within ChatKeyPromptProvider'
    )
  }
  return handle
}
