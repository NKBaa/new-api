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
export const THEME_STORAGE_KEYS = {
  mode: 'newapi:theme:v1:mode',
  preset: 'newapi:theme:v1:preset',
  font: 'newapi:theme:v1:font',
  radius: 'newapi:theme:v1:radius',
  scale: 'newapi:theme:v1:scale',
  contentLayout: 'newapi:theme:v1:content-layout',
  navbarRadius: 'newapi:theme:v1:navbar-radius',
  userModified: 'newapi:theme:v1:user-modified',
} as const

/** 用户可个性化的外观键，不含 userModified 标记本身。 */
export const THEME_PREFERENCE_KEYS = [
  'mode',
  'preset',
  'font',
  'radius',
  'scale',
  'contentLayout',
  'navbarRadius',
] as const

export function isUserThemeModified(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEYS.userModified) === 'true') {
      return true
    }
    // 兼容升级前已保存外观偏好的老用户：已存在的偏好本身就是「用户已个性化」的证据，
    // 若不认，他们保存的主题会在升级后被静默丢弃并回退到全站默认。
    return THEME_PREFERENCE_KEYS.some(
      (name) => window.localStorage.getItem(THEME_STORAGE_KEYS[name]) !== null
    )
  } catch {
    return false
  }
}

export function clearUserThemeModified(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEYS.userModified)
  } catch {
    // ignore
  }
}

export function markUserThemeModified(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEYS.userModified, 'true')
  } catch {
    // ignore
  }
}

export function readThemePreference<T extends string>(
  key: string,
  allowed: ReadonlySet<T>,
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback

  try {
    // Legacy cookies are shared across ports, so importing them would restore
    // preferences that may belong to another local instance.
    const value = window.localStorage.getItem(key)
    return value && allowed.has(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function writeThemePreference(key: string, value: string | null): void {
  if (typeof window === 'undefined') return

  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Keep theme controls usable when storage is blocked or full.
  }
}
