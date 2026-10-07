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
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { CustomerServiceScriptWidget } from '../customer-service-script-widget'

/**
 * The widget is mounted once at the root route, so it must load exactly one
 * external script element when the administrator enabled it, and must not leave
 * a stale script behind when the configuration changes or is turned off.
 */

const SCRIPT_SELECTOR = 'script#customer-service-script-widget'

function mockStatus(data: Record<string, unknown>) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data } })
}

function renderWidget() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerServiceScriptWidget />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll(SCRIPT_SELECTOR).forEach((node) => node.remove())
})

describe('CustomerServiceScriptWidget', () => {
  test('does not inject a script when the widget is disabled', async () => {
    mockStatus({
      customer_service_script_enabled: false,
      customer_service_script: 'https://maxkb.example.com/embed.js',
    })

    renderWidget()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull()
  })

  test('injects the configured external script when enabled', async () => {
    mockStatus({
      customer_service_script_enabled: true,
      customer_service_script:
        '<script async defer src="https://maxkb.example.com/embed.js?token=abc"></script>',
    })

    renderWidget()

    await waitFor(() =>
      expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeNull()
    )
    const script = document.querySelector(SCRIPT_SELECTOR) as HTMLScriptElement
    expect(script.getAttribute('src')).toBe(
      'https://maxkb.example.com/embed.js?token=abc'
    )
    expect(script.async).toBe(true)
    expect(script.defer).toBe(true)
  })

  test('ignores an inline script configuration instead of executing it', async () => {
    mockStatus({
      customer_service_script_enabled: true,
      customer_service_script: '<script>alert(1)</script>',
    })

    renderWidget()

    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull()
  })

  test('does not inject anything while the widget stays disabled', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          customer_service_script_enabled: false,
          customer_service_script: '',
        },
      },
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerServiceScriptWidget />
      </QueryClientProvider>
    )

    await waitFor(() => expect(get).toHaveBeenCalled())
    await client.invalidateQueries({ queryKey: ['status'] })

    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(0)
  })

  test('replaces the injected script when the configured src changes', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            customer_service_script_enabled: true,
            customer_service_script: 'https://maxkb.example.com/embed.js',
          },
        },
      })
      .mockResolvedValue({
        data: {
          success: true,
          data: {
            customer_service_script_enabled: true,
            customer_service_script: 'https://maxkb.example.com/embed-v2.js',
          },
        },
      })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerServiceScriptWidget />
      </QueryClientProvider>
    )

    await waitFor(() =>
      expect(
        document.querySelector(SCRIPT_SELECTOR)?.getAttribute('src')
      ).toBe('https://maxkb.example.com/embed.js')
    )

    await client.invalidateQueries({ queryKey: ['status'] })

    await waitFor(() =>
      expect(
        document.querySelector(SCRIPT_SELECTOR)?.getAttribute('src')
      ).toBe('https://maxkb.example.com/embed-v2.js')
    )
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1)
    expect(get).toHaveBeenCalled()
  })

  test('removes the injected script when the widget is turned off', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            customer_service_script_enabled: true,
            customer_service_script: 'https://maxkb.example.com/embed.js',
          },
        },
      })
      .mockResolvedValue({
        data: {
          success: true,
          data: {
            customer_service_script_enabled: false,
            customer_service_script: '',
          },
        },
      })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerServiceScriptWidget />
      </QueryClientProvider>
    )

    await waitFor(() =>
      expect(document.querySelector(SCRIPT_SELECTOR)).not.toBeNull()
    )

    await client.invalidateQueries({ queryKey: ['status'] })

    await waitFor(() =>
      expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull()
    )
    expect(get).toHaveBeenCalled()
  })
})
