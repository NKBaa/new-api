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
import { useEffect } from 'react'

import { useStatus } from '@/hooks/use-status'
import { parseCustomerServiceScript } from '@/lib/customer-service-script'

const SCRIPT_ELEMENT_ID = 'customer-service-script-widget'

/**
 * Load the administrator-configured third-party customer service widget.
 *
 * Mounted once at the root route so the vendor script (MaxKB and similar)
 * runs on every page. The tag is created through the DOM API rather than
 * `dangerouslySetInnerHTML`, and only external http(s) scripts pass
 * `parseCustomerServiceScript`, so the configuration can never inject inline
 * JavaScript.
 *
 * The vendor's own markup is left untouched: attributes the administrator did
 * not write are not added, so a vendor that validates its embed context still
 * sees the tag it expects.
 */
export function CustomerServiceScriptWidget() {
  const { status } = useStatus()

  const enabled = Boolean(
    status?.customer_service_script_enabled ??
      status?.data?.customer_service_script_enabled
  )
  const raw = (status?.customer_service_script ??
    status?.data?.customer_service_script) as string | undefined

  useEffect(() => {
    const config = enabled ? parseCustomerServiceScript(raw) : null

    const existing = document.querySelector<HTMLScriptElement>(
      `#${SCRIPT_ELEMENT_ID}`
    )
    if (
      existing &&
      config &&
      existing.getAttribute('src') === config.src &&
      existing.async === config.async &&
      existing.defer === config.defer
    ) {
      return
    }
    existing?.remove()
    if (!config) return

    const script = document.createElement('script')
    script.id = SCRIPT_ELEMENT_ID
    script.src = config.src
    script.async = config.async
    script.defer = config.defer
    document.body.appendChild(script)

    // Removes our script element only. Third-party widgets commonly append
    // their own nodes, which the vendor owns; those clear on reload.
    return () => {
      script.remove()
    }
  }, [enabled, raw])

  return null
}
