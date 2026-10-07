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
/**
 * Parse the third-party customer service widget configuration.
 *
 * Administrators may paste either a bare script URL or a complete
 * `<script src="...">` tag copied from the vendor console. Only external
 * scripts are accepted: inline bodies and event handler attributes are
 * rejected here as well as on the server, so a stored value can never become
 * an inline-code execution path.
 */
export interface CustomerServiceScriptConfig {
  src: string
  async: boolean
  defer: boolean
}

const SCRIPT_TAG_PATTERN = /^<script\b([^>]*)>([\s\S]*?)<\/script>$/i
const SRC_ATTRIBUTE_PATTERN = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const ASYNC_ATTRIBUTE_PATTERN = /(?:^|\s)async(?=[\s/>]|$)/i
const DEFER_ATTRIBUTE_PATTERN = /(?:^|\s)defer(?=[\s/>]|$)/i
const EVENT_HANDLER_PATTERN = /\bon[a-z]+\s*=/i

/** Only absolute http(s) URLs are loadable as a third-party widget script. */
export function isLoadableScriptUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseCustomerServiceScript(
  raw: string | undefined | null
): CustomerServiceScriptConfig | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  if (!trimmed.toLowerCase().startsWith('<script')) {
    return isLoadableScriptUrl(trimmed)
      ? { src: trimmed, async: true, defer: true }
      : null
  }

  const matches = SCRIPT_TAG_PATTERN.exec(trimmed)
  if (!matches) return null

  const attributes = matches[1]
  if (matches[2].trim() !== '') return null
  if (EVENT_HANDLER_PATTERN.test(attributes)) return null

  const srcMatch = SRC_ATTRIBUTE_PATTERN.exec(attributes)
  const src = srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? ''
  if (!isLoadableScriptUrl(src)) return null

  return {
    src: src.trim(),
    async: ASYNC_ATTRIBUTE_PATTERN.test(attributes),
    defer: DEFER_ATTRIBUTE_PATTERN.test(attributes),
  }
}
