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
import type { ErrorMappingRule } from '../types'

export type ErrorRuleConflict = {
  firstRuleId: number
  secondRuleId: number
  firstKeyword: string
  secondKeyword: string
}

function splitKeywords(raw: string): string[] {
  return raw
    .replaceAll('，', ',')
    .replaceAll('\r\n', ',')
    .replaceAll('\n', ',')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '')
}

function findSharedKeyword(
  leftKeywords: string[],
  rightKeywords: string[]
): { left: string; right: string } | null {
  for (const left of leftKeywords) {
    for (const right of rightKeywords) {
      if (left.includes(right) || right.includes(left)) {
        return { left, right }
      }
    }
  }
  return null
}

/**
 * Reports the same conflicts `common.ValidateErrorMappingRules` rejects, so the
 * editor can highlight them before a save round-trip.
 */
export function findErrorRuleConflicts(
  rules: ErrorMappingRule[]
): ErrorRuleConflict[] {
  const enabledRules = rules.filter((rule) => rule.enabled)
  const conflicts: ErrorRuleConflict[] = []

  for (let i = 0; i < enabledRules.length; i += 1) {
    const first = enabledRules[i]
    for (let j = i + 1; j < enabledRules.length; j += 1) {
      const second = enabledRules[j]
      const scopesOverlap =
        first.match_code === 0 ||
        second.match_code === 0 ||
        first.match_code === second.match_code
      if (!scopesOverlap) continue

      const firstKeywords = splitKeywords(first.keywords || '')
      const secondKeywords = splitKeywords(second.keywords || '')
      if (firstKeywords.length === 0 || secondKeywords.length === 0) {
        conflicts.push({
          firstRuleId: first.id,
          secondRuleId: second.id,
          firstKeyword: firstKeywords[0] ?? '',
          secondKeyword: secondKeywords[0] ?? '',
        })
        continue
      }

      const shared = findSharedKeyword(firstKeywords, secondKeywords)
      if (shared) {
        conflicts.push({
          firstRuleId: first.id,
          secondRuleId: second.id,
          firstKeyword: shared.left,
          secondKeyword: shared.right,
        })
      }
    }
  }

  return conflicts
}

export function collectConflictingRuleIds(
  conflicts: ErrorRuleConflict[]
): Set<number> {
  const ids = new Set<number>()
  for (const conflict of conflicts) {
    ids.add(conflict.firstRuleId)
    ids.add(conflict.secondRuleId)
  }
  return ids
}
