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
import { describe, expect, test } from 'vitest'

import {
  isLoadableScriptUrl,
  parseCustomerServiceScript,
} from '../customer-service-script'

/**
 * The widget configuration is stored by an administrator but executed on every
 * visitor's browser, so the parser is the boundary that keeps a stored value
 * from becoming an inline-code execution path. Only external http(s) scripts
 * may pass.
 */

describe('isLoadableScriptUrl', () => {
  test('accepts absolute http and https URLs', () => {
    expect(isLoadableScriptUrl('https://maxkb.example.com/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('http://maxkb.example.com/embed.js')).toBe(true)
  })

  test('rejects relative, protocol-relative and non-http protocols', () => {
    expect(isLoadableScriptUrl('/embed.js')).toBe(false)
    expect(isLoadableScriptUrl('//example.com/embed.js')).toBe(false)
    expect(isLoadableScriptUrl('javascript:alert(1)')).toBe(false)
    expect(isLoadableScriptUrl('data:text/javascript,alert(1)')).toBe(false)
    expect(isLoadableScriptUrl('')).toBe(false)
  })

  /**
   * These cases are the contract shared with the server's
   * `validateExternalScriptURL`. If the two drift, the admin form shows a value
   * as valid and the save then fails, so each rule is pinned here explicitly.
   */
  test('accepts internal hosts, explicit ports and percent-encoded paths', () => {
    expect(isLoadableScriptUrl('https://localhost/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('https://maxkb/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('https://127.0.0.1:8080/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('https://[2001:db8::1]/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('https://example.com:8443/embed.js')).toBe(true)
    expect(isLoadableScriptUrl('https://example.com/a%20b.js')).toBe(true)
    expect(isLoadableScriptUrl('HTTPS://MAXKB.EXAMPLE.COM/embed.js')).toBe(true)
  })

  test('rejects credentials embedded in the URL', () => {
    expect(isLoadableScriptUrl('https://user:pass@example.com/a.js')).toBe(
      false
    )
    expect(isLoadableScriptUrl('https://user@example.com/a.js')).toBe(false)
  })

  test('rejects out-of-range and non-numeric ports', () => {
    expect(isLoadableScriptUrl('https://example.com:0/a.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com:65536/a.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com:abc/a.js')).toBe(false)
  })

  test('rejects raw spaces, backslashes and invisible characters', () => {
    expect(isLoadableScriptUrl('https://example.com/a b.js')).toBe(false)
    expect(isLoadableScriptUrl('https://exa mple.com/a.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a\tb.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a.js\r\nHost: x')).toBe(
      false
    )
    expect(isLoadableScriptUrl('https://example.com\\@evil.com/a.js')).toBe(
      false
    )
    expect(isLoadableScriptUrl('https://trusted.com\\evil.com/a.js')).toBe(
      false
    )
    // Non-ASCII whitespace: `\s` and Go's unicode.IsSpace disagree on these.
    expect(isLoadableScriptUrl('https://example.com/a\u00a0b.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a\u2028b.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a\u3000b.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a\u0085b.js')).toBe(false)
    expect(isLoadableScriptUrl('https://example.com/a\ufeffb.js')).toBe(false)
  })

  test('rejects URLs without a host or scheme', () => {
    expect(isLoadableScriptUrl('https://')).toBe(false)
    expect(isLoadableScriptUrl('/a.js')).toBe(false)
  })
})

describe('parseCustomerServiceScript', () => {
  test('treats a bare URL as an async deferred external script', () => {
    expect(
      parseCustomerServiceScript('https://maxkb.example.com/embed.js?t=1')
    ).toEqual({
      src: 'https://maxkb.example.com/embed.js?t=1',
      async: true,
      defer: true,
    })
  })

  test('extracts src from a complete script tag and keeps async/defer flags', () => {
    expect(
      parseCustomerServiceScript(
        '<script async defer src="https://maxkb.example.com/chat/api/embed?protocol=https&host=x&token=4d8cb209"></script>'
      )
    ).toEqual({
      src: 'https://maxkb.example.com/chat/api/embed?protocol=https&host=x&token=4d8cb209',
      async: true,
      defer: true,
    })
  })

  test('supports single-quoted and unquoted src attributes', () => {
    expect(
      parseCustomerServiceScript(
        "<script src='https://example.com/a.js'></script>"
      )?.src
    ).toBe('https://example.com/a.js')
    expect(
      parseCustomerServiceScript(
        '<script src=https://example.com/b.js></script>'
      )?.src
    ).toBe('https://example.com/b.js')
  })

  test('reports missing async/defer as false', () => {
    const parsed = parseCustomerServiceScript(
      '<script src="https://example.com/a.js"></script>'
    )
    expect(parsed?.async).toBe(false)
    expect(parsed?.defer).toBe(false)
  })

  test('trims whitespace inside the src value', () => {
    expect(
      parseCustomerServiceScript(
        '<script src=" https://example.com/a.js "></script>'
      )?.src
    ).toBe('https://example.com/a.js')
  })

  test('rejects inline script bodies', () => {
    expect(parseCustomerServiceScript('<script>alert(1)</script>')).toBeNull()
    expect(
      parseCustomerServiceScript(
        '<script src="https://example.com/a.js">alert(1)</script>'
      )
    ).toBeNull()
  })

  test('rejects event handler attributes', () => {
    expect(
      parseCustomerServiceScript(
        '<script src="https://example.com/a.js" onload="alert(1)"></script>'
      )
    ).toBeNull()
  })

  test('rejects unclosed tags and unsafe protocols', () => {
    expect(
      parseCustomerServiceScript('<script src="https://example.com/a.js">')
    ).toBeNull()
    expect(
      parseCustomerServiceScript('<script src="javascript:alert(1)"></script>')
    ).toBeNull()
    expect(
      parseCustomerServiceScript(
        '<script src="ftp://example.com/a.js"></script>'
      )
    ).toBeNull()
  })

  test('returns null for empty configuration', () => {
    expect(parseCustomerServiceScript('')).toBeNull()
    expect(parseCustomerServiceScript('   ')).toBeNull()
    expect(parseCustomerServiceScript(undefined)).toBeNull()
  })
})
