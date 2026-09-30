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
import { t } from 'i18next'

import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import {
  requireServerSuccess,
  createServerError,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

/** Enabled tokens a chat preset may be launched with. */
export async function fetchEnabledChatKeys(): Promise<ApiKey[]> {
  const result = await getApiKeys({ p: 1, size: 100 })
  if (!result.success) {
    throw createServerError(result, t('Failed to load API keys'))
  }

  const items = result.data?.items ?? []
  return items.filter((item) => item.status === API_KEY_STATUS.ENABLED)
}

/**
 * Reveal the full secret of one token.
 *
 * The list API only returns masked keys, so this audited endpoint is required
 * before a key can be embedded into a chat link.
 */
export async function fetchChatKeyByTokenId(tokenId: number): Promise<string> {
  const keyResult = await fetchTokenKey(tokenId)
  if (!keyResult.success || !keyResult.data?.key) {
    throw createServerError(keyResult, t('Failed to load API keys'))
  }

  return `sk-${keyResult.data.key}`
}

export async function fetchActiveChatKey(): Promise<string> {
  const enabledKeys = await fetchEnabledChatKeys()
  const active = enabledKeys[0]
  if (!active) {
    throw new Error('No enabled API keys found. Create or enable one first.')
  }

  return fetchChatKeyByTokenId(active.id)
}

/**
 * Get the API key a chat link should be launched with.
 *
 * Without `tokenId` the first enabled token is used, which keeps existing
 * entry points (chat2link, direct `/chat/{id}` visits) working unchanged.
 */
export function useActiveChatKey(enabled: boolean, tokenId?: number) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const requestedTokenId = tokenId ?? null

  return useQuery({
    queryKey: ['chat-active-key', userId, requestedTokenId],
    queryFn: async () =>
      requireServerSuccess(
        requestedTokenId === null
          ? await fetchActiveChatKey()
          : await fetchChatKeyByTokenId(requestedTokenId)
      ),
    enabled: enabled && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

/** Tokens offered in the sidebar key picker. */
export function useEnabledChatKeys(enabled: boolean) {
  const userId = useAuthStore((state) => state.auth.user?.id)

  return useQuery({
    queryKey: ['chat-enabled-keys', userId],
    queryFn: fetchEnabledChatKeys,
    enabled: enabled && Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // The picker renders the failure inline; a toast would duplicate it.
    meta: { errorToast: false },
  })
}
