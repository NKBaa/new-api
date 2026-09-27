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
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { SystemInfoSection } from '../system-info-section'

/**
 * The home page style is an administrator choice between the official home page
 * and the alternate OpenRouter-style landing page. `classic` is the default, so
 * the control must show the official home page until an admin picks otherwise,
 * and it must only persist `HomePageStyle` when the value actually changed.
 */

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <SystemInfoSection
          defaultValues={{
            SystemName: 'New API',
            ServerAddress: '',
            TaskPublicAddress: '',
            Logo: '',
            Footer: '',
            About: '',
            HomePageContent: '',
            HomePageStyle: 'classic',
            general_setting: { docs_link: '' },
            legal: { user_agreement: '', privacy_policy: '' },
          }}
        />
      </SettingsPageProvider>
    </>
  )
}

async function renderSystemInfo() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: Fixture }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('combobox', { name: 'Home Page Style' })
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

test('defaults to the official home page', async () => {
  const selector = await renderSystemInfo()

  expect(selector).toHaveTextContent('Official home page')
})

test('selecting the OpenRouter style persists HomePageStyle as landing-v2', async () => {
  const user = userEvent.setup()
  const selector = await renderSystemInfo()

  await user.click(selector)
  await user.click(
    screen.getByRole('option', { name: 'OpenRouter style home page' })
  )
  expect(selector).toHaveTextContent('OpenRouter style home page')

  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'HomePageStyle',
      value: 'landing-v2',
    })
  )
})

test('leaving the selector untouched does not write HomePageStyle', async () => {
  const user = userEvent.setup()
  await renderSystemInfo()

  const name = screen.getByRole('textbox', { name: 'System Name' })
  await user.clear(name)
  await user.type(name, 'Renamed')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'SystemName',
      value: 'Renamed',
    })
  )
  expect(api.put).toHaveBeenCalledTimes(1)
})

/**
 * A `SelectTrigger` sizes itself to its content (`w-fit`), and `SelectContent`
 * pins the popup to the trigger width (`w-(--anchor-width)`) while clipping
 * horizontal overflow. With the shorter `Official home page` selected the
 * trigger collapsed to roughly 110px, so the popup was too narrow for
 * `OpenRouter style home page` and cut off its right edge. Both parts of the
 * control therefore need an explicit width contract.
 */
test('the trigger does not collapse to the shorter option label', async () => {
  const selector = await renderSystemInfo()

  expect(selector).toHaveClass('w-full', 'sm:w-[240px]')
})

test('the popup may outgrow the trigger so long option labels are not clipped', async () => {
  const user = userEvent.setup()
  const selector = await renderSystemInfo()

  await user.click(selector)
  const popup = document.querySelector('[data-slot=select-content]')

  expect(popup).not.toBeNull()
  expect(popup).toHaveClass('w-auto', 'min-w-(--anchor-width)')
  expect(popup).not.toHaveClass('w-(--anchor-width)')
})
