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
import { createContext, useContext, useMemo, useState } from 'react'

import { CCSwitchDialog } from './dialogs/cc-switch-dialog'

export type CCSwitchImportHandle = {
  /**
   * Show the CC Switch import dialog for an already revealed API key.
   *
   * Entry points resolve their own key first (the API key row menu uses that
   * row, the sidebar asks which key to use), then hand the secret over.
   */
  openImport: (tokenKey: string) => void
}

const CCSwitchImportContext = createContext<CCSwitchImportHandle | null>(null)

/**
 * Hosts the CC Switch import dialog above the sidebar.
 *
 * Mounted outside the sidebar so the dialog is not nested inside the mobile
 * navigation sheet, which would suppress its backdrop and stack below it. One
 * host keeps every entry point on the same dialog instance.
 */
export function CCSwitchImportProvider(props: { children: React.ReactNode }) {
  const [tokenKey, setTokenKey] = useState<string | null>(null)

  const handle = useMemo<CCSwitchImportHandle>(
    () => ({ openImport: (key: string) => setTokenKey(key) }),
    []
  )

  return (
    <CCSwitchImportContext.Provider value={handle}>
      {props.children}
      <CCSwitchDialog
        open={tokenKey !== null}
        tokenKey={tokenKey ?? ''}
        onOpenChange={(open) => {
          if (!open) setTokenKey(null)
        }}
      />
    </CCSwitchImportContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCCSwitchImport(): CCSwitchImportHandle {
  const handle = useContext(CCSwitchImportContext)

  if (!handle) {
    throw new Error(
      'useCCSwitchImport must be used within CCSwitchImportProvider'
    )
  }

  return handle
}
