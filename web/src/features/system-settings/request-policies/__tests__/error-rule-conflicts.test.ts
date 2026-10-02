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
import { describe, expect, it } from 'vitest'

import type { ErrorMappingRule } from '../../types'
import {
  collectConflictingRuleIds,
  findErrorRuleConflicts,
} from '../error-rule-conflicts'

function rule(overrides: Partial<ErrorMappingRule>): ErrorMappingRule {
  return {
    id: 1,
    name: 'Rule',
    match_code: 0,
    keywords: 'quota',
    replace_msg: 'Sanitized',
    override_code: 502,
    enabled: true,
    ...overrides,
  }
}

describe('findErrorRuleConflicts', () => {
  it('reports a substring keyword overlap inside the same status scope', () => {
    const conflicts = findErrorRuleConflicts([
      rule({ id: 1, name: 'Quota', keywords: 'quota' }),
      rule({
        id: 2,
        name: 'Rate limit',
        keywords: 'rate limit, quota exceeded',
      }),
    ])

    expect(conflicts).toEqual([
      {
        firstRuleId: 1,
        secondRuleId: 2,
        firstKeyword: 'quota',
        secondKeyword: 'quota exceeded',
      },
    ])
  })

  it('treats a catch-all wildcard rule as conflicting with any enabled rule', () => {
    const conflicts = findErrorRuleConflicts([
      rule({ id: 3, name: 'Any', keywords: '' }),
      rule({ id: 4, name: 'Specific', keywords: 'model_not_found' }),
    ])

    expect(conflicts).toEqual([
      {
        firstRuleId: 3,
        secondRuleId: 4,
        firstKeyword: '',
        secondKeyword: 'model_not_found',
      },
    ])
  })

  it('does not report rules whose status scopes are disjoint', () => {
    expect(
      findErrorRuleConflicts([
        rule({ id: 5, match_code: 401, keywords: 'unauthorized' }),
        rule({ id: 6, match_code: 429, keywords: 'unauthorized' }),
      ])
    ).toEqual([])
  })

  it('ignores disabled rules and keyword overlaps with no shared substring', () => {
    expect(
      findErrorRuleConflicts([
        rule({ id: 7, keywords: 'quota' }),
        rule({ id: 8, keywords: 'quota exceeded', enabled: false }),
      ])
    ).toEqual([])
    expect(
      findErrorRuleConflicts([
        rule({ id: 9, keywords: 'quota' }),
        rule({ id: 10, keywords: 'unauthorized' }),
      ])
    ).toEqual([])
  })

  it('normalizes full-width and newline separators before comparing', () => {
    const conflicts = findErrorRuleConflicts([
      rule({ id: 11, keywords: 'Quota Exceeded' }),
      rule({ id: 12, keywords: 'quota，exceeded\nfallback' }),
    ])

    expect(conflicts).toEqual([
      {
        firstRuleId: 11,
        secondRuleId: 12,
        firstKeyword: 'quota exceeded',
        secondKeyword: 'quota',
      },
    ])
  })

  it('collects every rule id involved in a conflict exactly once', () => {
    const conflicts = findErrorRuleConflicts([
      rule({ id: 13, keywords: 'quota' }),
      rule({ id: 14, keywords: 'quota exceeded' }),
      rule({ id: 15, keywords: 'quota exceeded, more quota' }),
    ])

    expect(collectConflictingRuleIds(conflicts)).toEqual(new Set([13, 14, 15]))
  })
})
