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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { CustomerServiceScriptSection } from '../customer-service-script-section'

/**
 * The admin form must refuse to persist an unusable widget configuration, and
 * must only write the option key it owns. Saving is what makes a pasted vendor
 * embed tag take effect site-wide, so an invalid value has to be blocked before
 * the request rather than discovered by visitors.
 */

function renderSection(script: string, enabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <CustomerServiceScriptSection enabled={enabled} script={script} />
    </QueryClientProvider>
  )
  return screen.getByRole('textbox', { name: 'Widget Script or URL' })
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

describe('CustomerServiceScriptSection', () => {
  test('saves a complete vendor embed tag', async () => {
    const user = userEvent.setup()
    const input = renderSection('')

    await user.type(
      input,
      '<script async defer src="https://maxkb.example.com/embed.js?token=abc"></script>'
    )
    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/option/', {
        key: 'console_setting.customer_service_script',
        value:
          '<script async defer src="https://maxkb.example.com/embed.js?token=abc"></script>',
      })
    )
  })

  test('blocks saving an inline script', async () => {
    const user = userEvent.setup()
    const input = renderSection('')

    await user.type(input, '<script>alert(1)</script>')

    expect(
      screen.getByText(
        'Enter a complete <script src="..."> tag or an http(s) script URL. Inline scripts are not allowed.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
    expect(api.put).not.toHaveBeenCalled()
  })

  test('keeps the save button disabled until the value changes', () => {
    renderSection('https://maxkb.example.com/embed.js')

    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
  })

  test('writes the enable flag when the value is usable', async () => {
    const user = userEvent.setup()
    renderSection('https://maxkb.example.com/embed.js')

    await user.click(
      screen.getByRole('switch', {
        name: 'Enable third-party customer service widget',
      })
    )

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/option/', {
        key: 'console_setting.customer_service_script_enabled',
        value: true,
      })
    )
  })

  test('persists the pending script before turning the widget on', async () => {
    const user = userEvent.setup()
    const input = renderSection('')

    await user.type(input, 'https://maxkb.example.com/embed.js')
    await user.click(
      screen.getByRole('switch', {
        name: 'Enable third-party customer service widget',
      })
    )

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/option/', {
        key: 'console_setting.customer_service_script',
        value: 'https://maxkb.example.com/embed.js',
      })
    )
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'console_setting.customer_service_script_enabled',
      value: true,
    })
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({
      key: 'console_setting.customer_service_script',
    })
  })

  test('refuses to enable the widget while the value is invalid', async () => {
    const user = userEvent.setup()
    const input = renderSection('')

    await user.type(input, '<script>alert(1)</script>')
    await user.click(
      screen.getByRole('switch', {
        name: 'Enable third-party customer service widget',
      })
    )

    expect(api.put).not.toHaveBeenCalled()
    expect(
      screen.getByRole('switch', {
        name: 'Enable third-party customer service widget',
      })
    ).toHaveAttribute('aria-checked', 'false')
  })
})
