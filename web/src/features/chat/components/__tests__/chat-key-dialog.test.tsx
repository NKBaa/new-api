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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { ChatKeyDialog } from '../chat-key-dialog'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: { get, post },
}))

const preset = {
  id: '2',
  name: 'Lobe Chat',
  url: 'https://chat.example.com/?key={key}',
  type: 'web' as const,
}

let queryClient: QueryClient
const initialAuth = useAuthStore.getInitialState().auth

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  useAuthStore.setState({ auth: { ...initialAuth, user: { id: 1 } as never } })
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
})

afterEach(() => {
  queryClient.clear()
  useAuthStore.setState({ auth: initialAuth })
})

async function renderDialog(onConfirm = vi.fn()) {
  const root = createRootRoute()
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <ChatKeyDialog
        preset={preset}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('dialog', { name: 'Select API Key' })
  return onConfirm
}

type ListedKey = { id: number; name: string; key: string; status: number }

function respondWithKeys(items: ListedKey[]) {
  get.mockResolvedValue({
    data: { success: true, data: { items, total: items.length } },
  })
}

describe('chat preset API key picker', () => {
  it('lists only enabled keys and confirms the first one by default', async () => {
    respondWithKeys([
      { id: 3, name: 'disabled token', key: 'masked3', status: 2 },
      { id: 7, name: 'production', key: 'masked7', status: 1 },
    ])
    const onConfirm = await renderDialog()

    expect(
      await screen.findByRole('radio', { name: /production/ })
    ).toBeVisible()
    expect(
      screen.queryByRole('radio', { name: /disabled token/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Select API Key' })
    ).toHaveTextContent('Lobe Chat')

    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm & Launch' })
    )

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(7))
  })

  it('confirms the key the user picks instead of the default', async () => {
    respondWithKeys([
      { id: 7, name: 'production', key: 'masked7', status: 1 },
      { id: 9, name: 'staging', key: 'masked9', status: 1 },
    ])
    const onConfirm = await renderDialog()

    await userEvent.click(await screen.findByRole('radio', { name: /staging/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm & Launch' })
    )

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(9))
  })

  it('offers a create-key path and disables confirming when no key is enabled', async () => {
    respondWithKeys([
      { id: 3, name: 'disabled token', key: 'masked3', status: 2 },
    ])
    const onConfirm = await renderDialog()

    expect(await screen.findByText('No enabled API keys')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to API Keys' })
    ).toHaveAttribute('href', '/keys')
    expect(
      screen.getByRole('button', { name: 'Confirm & Launch' })
    ).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows a retryable failure when the key list cannot be loaded', async () => {
    get.mockResolvedValue({
      data: { success: false, message: 'server unavailable' },
    })
    await renderDialog()

    expect(await screen.findByText('Unable to load API keys')).toBeVisible()
    expect(screen.getByText('server unavailable')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
