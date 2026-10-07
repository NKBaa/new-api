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

/**
 * Only absolute http(s) URLs are loadable as a third-party widget script.
 *
 * These rules mirror the server's `validateExternalScriptURL` one-for-one, so a
 * value the admin form accepts is never rejected on save. Keep the two in step
 * when either changes:
 * - rejects whitespace, control characters and backslashes: the WHATWG parser
 *   treats `\` as `/`, so `https://a.com\@b.com/x.js` parses differently in a
 *   browser and in Go, and raw spaces are not valid URL characters
 * - requires the http/https scheme and a non-empty hostname, so a bare
 *   `javascript:` or relative path cannot pass
 * - rejects userinfo: the value is served to every visitor via `/api/status`
 * - requires any port to be in range 1-65535
 *
 * The forbidden-character test below is spelled out per code point rather than
 * using `\s`, because JavaScript and Go disagree on what counts as whitespace
 * (`\s` also matches U+FEFF and U+00A0; Go's unicode.IsSpace also matches
 * U+0085). An explicit list is the only way to keep both sides provably
 * identical; it mirrors `isForbiddenScriptURLRune` in the Go validator.
 */
function isForbiddenUrlChar(codePoint: number): boolean {
  if (codePoint <= 0x20) return true
  if (codePoint === 0x7f || codePoint === 0x85 || codePoint === 0xa0) {
    return true
  }
  if (codePoint === 0x1680) return true
  if (codePoint >= 0x2000 && codePoint <= 0x200a) return true
  if (codePoint === 0x2028 || codePoint === 0x2029) return true
  if (codePoint === 0x202f || codePoint === 0x205f) return true
  if (codePoint === 0x3000 || codePoint === 0xfeff) return true
  return codePoint === 0x5c // backslash: parsed as "/" by browsers, rejected by Go
}

export function isLoadableScriptUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  for (const char of trimmed) {
    if (isForbiddenUrlChar(char.codePointAt(0) as number)) return false
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (!parsed.hostname) return false
  if (parsed.username || parsed.password) return false

  if (parsed.port) {
    const port = Number(parsed.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false
  }

  return true
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
