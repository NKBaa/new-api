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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  CONTENT_LAYOUT_VALUES,
  type ContentLayout,
  DEFAULT_THEME_CUSTOMIZATION,
  resolveThemeFont,
  THEME_FONT_VALUES,
  THEME_PRESET_VALUES,
  THEME_RADIUS_VALUES,
  THEME_SCALE_VALUES,
  THEME_NAVBAR_RADIUS_VALUES,
  type ThemeCustomization,
  type ThemeFont,
  type ThemePreset,
  type ThemeRadius,
  type ThemeScale,
  type ThemeNavbarRadius,
} from '@/lib/theme-customization'
import {
  clearUserThemeModified,
  isUserThemeModified,
  markUserThemeModified,
  readThemePreference,
  THEME_STORAGE_KEYS,
  writeThemePreference,
} from '@/lib/theme-storage'
import { useSystemConfigStore } from '@/stores/system-config-store'

function applyAttribute(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (value === null) {
    body.removeAttribute(name)
  } else {
    body.setAttribute(name, value)
  }
}

type ThemeCustomizationContextType = {
  defaults: ThemeCustomization
  customization: ThemeCustomization
  setPreset: (preset: ThemePreset) => void
  setFont: (font: ThemeFont) => void
  setRadius: (radius: ThemeRadius) => void
  setScale: (scale: ThemeScale) => void
  setContentLayout: (contentLayout: ContentLayout) => void
  setNavbarRadius: (navbarRadius: ThemeNavbarRadius) => void
  resetCustomization: () => void
}

// Fallback used when a consumer renders outside the provider (e.g. an error
// route mounted before providers are ready, or stale HMR boundaries). Keeping
// it permissive prevents the whole tree from crashing — the UI just behaves
// like the defaults until the real provider re-mounts.
const FALLBACK_CONTEXT: ThemeCustomizationContextType = {
  defaults: DEFAULT_THEME_CUSTOMIZATION,
  customization: DEFAULT_THEME_CUSTOMIZATION,
  setPreset: () => {},
  setFont: () => {},
  setRadius: () => {},
  setScale: () => {},
  setContentLayout: () => {},
  setNavbarRadius: () => {},
  resetCustomization: () => {},
}

const ThemeCustomizationContext =
  createContext<ThemeCustomizationContextType>(FALLBACK_CONTEXT)

export function ThemeCustomizationProvider(props: {
  children: React.ReactNode
}) {
  const defaultThemeSettings = useSystemConfigStore(
    (state) => state.config.defaultThemeSettings
  )

  const effectiveDefaults = useMemo<ThemeCustomization>(() => {
    return {
      preset:
        defaultThemeSettings?.preset &&
        THEME_PRESET_VALUES.has(defaultThemeSettings.preset)
          ? defaultThemeSettings.preset
          : DEFAULT_THEME_CUSTOMIZATION.preset,
      font:
        defaultThemeSettings?.font &&
        THEME_FONT_VALUES.has(defaultThemeSettings.font)
          ? defaultThemeSettings.font
          : DEFAULT_THEME_CUSTOMIZATION.font,
      radius:
        defaultThemeSettings?.radius &&
        THEME_RADIUS_VALUES.has(defaultThemeSettings.radius)
          ? defaultThemeSettings.radius
          : DEFAULT_THEME_CUSTOMIZATION.radius,
      scale:
        defaultThemeSettings?.scale &&
        THEME_SCALE_VALUES.has(defaultThemeSettings.scale)
          ? defaultThemeSettings.scale
          : DEFAULT_THEME_CUSTOMIZATION.scale,
      contentLayout:
        defaultThemeSettings?.contentLayout &&
        CONTENT_LAYOUT_VALUES.has(defaultThemeSettings.contentLayout)
          ? defaultThemeSettings.contentLayout
          : DEFAULT_THEME_CUSTOMIZATION.contentLayout,
      navbarRadius:
        defaultThemeSettings?.navbarRadius &&
        THEME_NAVBAR_RADIUS_VALUES.has(defaultThemeSettings.navbarRadius)
          ? defaultThemeSettings.navbarRadius
          : DEFAULT_THEME_CUSTOMIZATION.navbarRadius,
    }
  }, [defaultThemeSettings])

  const [preset, _setPreset] = useState<ThemePreset>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ThemePreset>(
        THEME_STORAGE_KEYS.preset,
        THEME_PRESET_VALUES,
        effectiveDefaults.preset
      )
    }
    return effectiveDefaults.preset
  })
  const [font, _setFont] = useState<ThemeFont>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ThemeFont>(
        THEME_STORAGE_KEYS.font,
        THEME_FONT_VALUES,
        effectiveDefaults.font
      )
    }
    return effectiveDefaults.font
  })
  const [radius, _setRadius] = useState<ThemeRadius>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ThemeRadius>(
        THEME_STORAGE_KEYS.radius,
        THEME_RADIUS_VALUES,
        effectiveDefaults.radius
      )
    }
    return effectiveDefaults.radius
  })
  const [scale, _setScale] = useState<ThemeScale>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ThemeScale>(
        THEME_STORAGE_KEYS.scale,
        THEME_SCALE_VALUES,
        effectiveDefaults.scale
      )
    }
    return effectiveDefaults.scale
  })
  const [contentLayout, _setContentLayout] = useState<ContentLayout>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ContentLayout>(
        THEME_STORAGE_KEYS.contentLayout,
        CONTENT_LAYOUT_VALUES,
        effectiveDefaults.contentLayout
      )
    }
    return effectiveDefaults.contentLayout
  })
  const [navbarRadius, _setNavbarRadius] = useState<ThemeNavbarRadius>(() => {
    if (isUserThemeModified()) {
      return readThemePreference<ThemeNavbarRadius>(
        THEME_STORAGE_KEYS.navbarRadius,
        THEME_NAVBAR_RADIUS_VALUES,
        effectiveDefaults.navbarRadius
      )
    }
    return effectiveDefaults.navbarRadius
  })

  // Adjust state during render when effectiveDefaults change and user has not explicitly modified theme
  const [prevDefaults, setPrevDefaults] = useState(effectiveDefaults)
  if (prevDefaults !== effectiveDefaults) {
    setPrevDefaults(effectiveDefaults)
    if (!isUserThemeModified()) {
      _setPreset(effectiveDefaults.preset)
      _setFont(effectiveDefaults.font)
      _setRadius(effectiveDefaults.radius)
      _setScale(effectiveDefaults.scale)
      _setContentLayout(effectiveDefaults.contentLayout)
      _setNavbarRadius(effectiveDefaults.navbarRadius)
    }
  }

  // Mirror state to the <body> via data-* attributes so theme-presets.css can
  // override CSS variables at the right cascade layer.
  useEffect(() => {
    applyAttribute(
      'data-theme-preset',
      preset === DEFAULT_THEME_CUSTOMIZATION.preset ? null : preset
    )
  }, [preset])

  // Font is the one axis where we resolve before writing the attribute:
  // the persisted preference may be `default`, but CSS works in terms of
  // the concrete `sans`/`serif` choice that should drive the cascade.
  // Resolving here (instead of in CSS via `:not()` selectors) keeps the
  // stylesheet to one simple `[data-theme-font='serif']` selector and lets
  // future presets opt into typography via `PRESET_DEFAULT_FONT` alone.
  useEffect(() => {
    applyAttribute('data-theme-font', resolveThemeFont(font, preset))
  }, [font, preset])

  useEffect(() => {
    applyAttribute(
      'data-theme-radius',
      radius === DEFAULT_THEME_CUSTOMIZATION.radius ? null : radius
    )
  }, [radius])

  useEffect(() => {
    applyAttribute(
      'data-theme-scale',
      scale === DEFAULT_THEME_CUSTOMIZATION.scale ? null : scale
    )
  }, [scale])

  useEffect(() => {
    applyAttribute('data-theme-content-layout', contentLayout)
  }, [contentLayout])

  const markUserModified = useCallback(() => {
    markUserThemeModified()
  }, [])

  const setPreset = useCallback(
    (value: ThemePreset) => {
      markUserModified()
      _setPreset(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.preset,
        value === effectiveDefaults.preset ? null : value
      )
    },
    [markUserModified, effectiveDefaults.preset]
  )

  const setFont = useCallback(
    (value: ThemeFont) => {
      markUserModified()
      _setFont(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.font,
        value === effectiveDefaults.font ? null : value
      )
    },
    [markUserModified, effectiveDefaults.font]
  )

  const setRadius = useCallback(
    (value: ThemeRadius) => {
      markUserModified()
      _setRadius(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.radius,
        value === effectiveDefaults.radius ? null : value
      )
    },
    [markUserModified, effectiveDefaults.radius]
  )

  const setScale = useCallback(
    (value: ThemeScale) => {
      markUserModified()
      _setScale(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.scale,
        value === effectiveDefaults.scale ? null : value
      )
    },
    [markUserModified, effectiveDefaults.scale]
  )

  const setContentLayout = useCallback(
    (value: ContentLayout) => {
      markUserModified()
      _setContentLayout(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.contentLayout,
        value === effectiveDefaults.contentLayout ? null : value
      )
    },
    [markUserModified, effectiveDefaults.contentLayout]
  )

  const setNavbarRadius = useCallback(
    (value: ThemeNavbarRadius) => {
      markUserModified()
      _setNavbarRadius(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.navbarRadius,
        value === effectiveDefaults.navbarRadius ? null : value
      )
    },
    [markUserModified, effectiveDefaults.navbarRadius]
  )

  const resetCustomization = useCallback(() => {
    clearUserThemeModified()
    writeThemePreference(THEME_STORAGE_KEYS.preset, null)
    writeThemePreference(THEME_STORAGE_KEYS.font, null)
    writeThemePreference(THEME_STORAGE_KEYS.radius, null)
    writeThemePreference(THEME_STORAGE_KEYS.scale, null)
    writeThemePreference(THEME_STORAGE_KEYS.contentLayout, null)
    writeThemePreference(THEME_STORAGE_KEYS.navbarRadius, null)
    _setPreset(effectiveDefaults.preset)
    _setFont(effectiveDefaults.font)
    _setRadius(effectiveDefaults.radius)
    _setScale(effectiveDefaults.scale)
    _setContentLayout(effectiveDefaults.contentLayout)
    _setNavbarRadius(effectiveDefaults.navbarRadius)
  }, [effectiveDefaults])

  const value = useMemo<ThemeCustomizationContextType>(
    () => ({
      defaults: effectiveDefaults,
      customization: { preset, font, radius, scale, contentLayout, navbarRadius },
      setPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      setNavbarRadius,
      resetCustomization,
    }),
    [
      effectiveDefaults,
      preset,
      font,
      radius,
      scale,
      contentLayout,
      navbarRadius,
      setPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      setNavbarRadius,
      resetCustomization,
    ]
  )

  return (
    <ThemeCustomizationContext.Provider value={value}>
      {props.children}
    </ThemeCustomizationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeCustomization() {
  return useContext(ThemeCustomizationContext)
}
