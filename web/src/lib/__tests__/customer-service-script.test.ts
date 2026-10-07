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
