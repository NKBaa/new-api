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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { ChatKeyPromptProvider } from '@/features/chat/components/chat-key-prompt-provider'
import { useChatPresets } from '@/features/chat/hooks/use-chat-presets'
import { CCSwitchImportProvider } from '@/features/keys/components/cc-switch-import-provider'
import { useAuthStore } from '@/stores/auth-store'

import { CCSwitchMenuItem } from '../cc-switch-menu-item'

const { get, post, status } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  status: {} as Record<string, unknown>,
}))

vi.mock('@/lib/api', () => ({
  api: { get, post },
  getStatus: () => Promise.resolve({ ...status }),
}))

/**
 * Mirrors `setting/chat.go`: the bare `ccswitch` marker CC Switch publishes plus
 * one real link. Each preset is a single-key object.
 */
const CHATS = [
  {
    'Cherry Studio':
      'cherrystudio://providers/api-keys?v=1&data={cherryConfig}',
  },
  { 'CC Switch': 'ccswitch' },
]

const initialAuth = useAuthStore.getInitialState().auth
let queryClient: QueryClient

// jsdom does not implement `Element.getAnimations`, which the Base UI ScrollArea
// viewport in the key picker calls after mount to re-measure thumb geometry.
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

afterEach(() => {
  queryClient.clear()
  useAuthStore.setState({ auth: initialAuth })
})

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  localStorage.clear()
  useAuthStore.setState({ auth: { ...initialAuth, user: { id: 1 } as never } })
  status.chats = CHATS
  status.server_address = 'https://gateway.example'
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  get.mockImplementation((url: string) => {
    if (url.includes('/api/user/models')) {
      return Promise.resolve({ data: { success: true, data: ['gpt-5.4'] } })
    }
    return Promise.resolve({
      data: {
        success: true,
        data: {
          items: [{ id: 7, name: 'production', key: 'masked7', status: 1 }],
          total: 1,
        },
      },
    })
  })
  post.mockResolvedValue({
    data: { success: true, data: { key: 'revealed-secret' } },
  })
})

function PresetProbe() {
  const { chatPresets } = useChatPresets()
  return <span data-testid='preset-count'>{chatPresets.length}</span>
}

function renderEntry() {
  render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <ChatKeyPromptProvider>
          <CCSwitchImportProvider>
            <PresetProbe />
            <CCSwitchMenuItem
              item={{
                title: 'CC Switch',
                icon: undefined,
                type: 'cc-switch',
              }}
            />
          </CCSwitchImportProvider>
        </ChatKeyPromptProvider>
      </SidebarProvider>
    </QueryClientProvider>
  )
}

describe('CC Switch sidebar entry', () => {
  it('offers a CC Switch entry that opens the import dialog with the picked key', async () => {
    renderEntry()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /CC Switch/ }))

    // Reuses the shared key picker rather than inventing a second credential
    // chooser, and confirms with import wording instead of launch wording.
    const picker = await screen.findByRole('dialog', { name: 'Select API Key' })
    expect(picker).toHaveTextContent('CC Switch')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Import to CC Switch',
    })
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/token/7/key'))
    expect(dialog).toBeVisible()
  })

  it('stays hidden when the deployment does not configure the CC Switch preset', async () => {
    status.chats = [{ 'Cherry Studio': 'cherrystudio://providers/api-keys' }]

    renderEntry()

    // Wait for the presets to arrive, then assert the entry never appeared.
    await waitFor(() =>
      expect(screen.getByTestId('preset-count')).toHaveTextContent('1')
    )
    expect(
      screen.queryByRole('button', { name: /CC Switch/ })
    ).not.toBeInTheDocument()
  })
})
