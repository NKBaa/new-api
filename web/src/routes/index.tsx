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
import { createFileRoute } from '@tanstack/react-router'

import { Home } from '@/features/home'
import { LandingV2 } from '@/features/landing-v2'
import { useSystemConfigStore } from '@/stores/system-config-store'

/**
 * Root route entry point.
 *
 * Which landing experience renders is an administrator choice stored in the
 * `HomePageStyle` option and published through `/api/status`. Reading the
 * persisted store keeps the cached choice stable across a reload, so a site
 * configured for the alternate landing page does not flash the official home
 * page first. `classic` (the official home page) is the default.
 */
function RootPage() {
  const homePageStyle = useSystemConfigStore(
    (state) => state.config.homePageStyle
  )

  if (homePageStyle === 'landing-v2') {
    return <LandingV2 />
  }

  return <Home />
}

export const Route = createFileRoute('/')({
  component: RootPage,
})
