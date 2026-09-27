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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Route } from '@/routes/index'
import {
  useSystemConfigStore,
  type HomePageStyle,
} from '@/stores/system-config-store'

/**
 * The root route is the switch between the official home page and the
 * alternate OpenRouter-style landing page. Administrators choose it in system
 * settings; `/api/status` publishes it as `home_page_style`.
 *
 * Only an explicit `landing-v2` reaches the alternate landing page. A store
 * written before the option existed, or a `classic` selection, must keep the
 * official home page — that is the documented default, so a wrong value must
 * never displace `/` by accident.
 */

const homeMock = vi.hoisted(() =>
  vi.fn(() => <div data-testid='official-home' />)
)
const landingMock = vi.hoisted(() =>
  vi.fn(() => <div data-testid='landing-v2' />)
)

vi.mock('@/features/home', () => ({ Home: homeMock }))
vi.mock('@/features/landing-v2', () => ({ LandingV2: landingMock }))

/** Render the root route with `homePageStyle` already in the persisted store. */
function renderRoot(homePageStyle: HomePageStyle | undefined) {
  const state = useSystemConfigStore.getState()
  useSystemConfigStore.setState({
    config: {
      ...state.config,
      homePageStyle,
    },
  })

  const RootPage = Route.options.component
  if (!RootPage) throw new Error('the root route has no component')
  render(<RootPage />)
}

beforeEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

test.each([
  ['classic', 'official-home'],
  ['landing-v2', 'landing-v2'],
] as const)(
  'homePageStyle "%s" renders only %s',
  (homePageStyle, expected) => {
    renderRoot(homePageStyle)

    expect(screen.getByTestId(expected)).toBeInTheDocument()
    const rendered = [homeMock, landingMock].filter(
      (mock) => mock.mock.calls.length > 0
    )
    expect(rendered).toHaveLength(1)
  }
)

test('an unset homePageStyle falls back to the official home page', () => {
  renderRoot(undefined)

  expect(screen.getByTestId('official-home')).toBeInTheDocument()
  expect(landingMock).not.toHaveBeenCalled()
})
