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
import type { ReactNode } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { useChatKeyPrompt } from '@/features/chat/hooks/use-chat-key-prompt'
import type { ChatPreset } from '@/features/chat/lib/chat-links'
import { useAuthStore } from '@/stores/auth-store'
import { useChatKeyPreferenceStore } from '@/stores/chat-key-preference-store'

import { ChatKeyPromptProvider } from '../chat-key-prompt-provider'

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: { get, post },
}))

const preset: ChatPreset = {
  id: '2',
  name: 'Lobe Chat',
  url: 'https://chat.example.com/?key={key}',
  type: 'web',
}

const protocolPreset: ChatPreset = {
  id: '3',
  name: 'Cherry Studio',
  url: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}',
  type: 'custom-protocol',
}

const initialAuth = useAuthStore.getInitialState().auth
let queryClient: QueryClient

// jsdom does not implement `Element.getAnimations`, which the Base UI
// ScrollArea viewport calls after mount to re-measure thumb geometry. Without
// it the picker's key list raises an unhandled TypeError that fails the run
// even though every assertion passes.
const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
    return
  }
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  localStorage.clear()
  useChatKeyPreferenceStore.setState({ lastTokenId: null })
  useAuthStore.setState({ auth: { ...initialAuth, user: { id: 1 } as never } })
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  get.mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [
          { id: 7, name: 'production', key: 'masked7', status: 1 },
          { id: 9, name: 'staging', key: 'masked9', status: 1 },
        ],
        total: 2,
      },
    },
  })
})

afterEach(() => {
  queryClient.clear()
  useAuthStore.setState({ auth: initialAuth })
})

function TriggerButton() {
  const { requestKey } = useChatKeyPrompt()
  return (
    <button type='button' onClick={() => requestKey(preset)}>
      Launch preset
    </button>
  )
}

function ProtocolTriggerButton({
  onPick,
}: {
  onPick: (tokenId: number) => void
}) {
  const { requestKey } = useChatKeyPrompt()
  return (
    <button type='button' onClick={() => requestKey(protocolPreset, onPick)}>
      Launch protocol preset
    </button>
  )
}

async function renderProvider(trigger: ReactNode = <TriggerButton />) {
  const root = createRootRoute()
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <SidebarProvider>
        <ChatKeyPromptProvider>{trigger}</ChatKeyPromptProvider>
      </SidebarProvider>
    ),
  })
  const chat = createRoute({
    getParentRoute: () => root,
    path: '/chat/$chatId',
    validateSearch: (search: Record<string, unknown>) => ({
      key: Number(search.key),
    }),
    component: () => <div>chat route</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([index, chat]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

describe('chat key prompt provider', () => {
  it('navigates to the preset with the picked token id once confirmed', async () => {
    const router = await renderProvider()
    await userEvent.click(screen.getByRole('button', { name: 'Launch preset' }))

    await userEvent.click(await screen.findByRole('radio', { name: /staging/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm & Launch' })
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/2'))
    expect(router.state.location.search).toEqual({ key: 9 })
  })

  it('keeps the route unchanged and remembers nothing when dismissed', async () => {
    const router = await renderProvider()
    await userEvent.click(screen.getByRole('button', { name: 'Launch preset' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(router.state.location.pathname).toBe('/')
    expect(useChatKeyPreferenceStore.getState().lastTokenId).toBeNull()
  })

  it('hands the picked token id to a custom-protocol caller instead of navigating', async () => {
    const onPick = vi.fn()
    const router = await renderProvider(
      <ProtocolTriggerButton onPick={onPick} />
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Launch protocol preset' })
    )

    await userEvent.click(await screen.findByRole('radio', { name: /staging/ }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm & Launch' })
    )

    await waitFor(() => expect(onPick).toHaveBeenCalledWith(9))
    expect(useChatKeyPreferenceStore.getState().lastTokenId).toBe(9)
    expect(router.state.location.pathname).toBe('/')
  })

  it('does not call the custom-protocol caller when the picker is dismissed', async () => {
    const onPick = vi.fn()
    await renderProvider(<ProtocolTriggerButton onPick={onPick} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Launch protocol preset' })
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(onPick).not.toHaveBeenCalled()
    expect(useChatKeyPreferenceStore.getState().lastTokenId).toBeNull()
  })
})
