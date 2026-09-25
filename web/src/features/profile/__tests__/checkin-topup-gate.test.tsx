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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CheckinCalendarCard } from '../components/checkin-calendar-card'

const { getCheckinStatusMock } = vi.hoisted(() => ({
  getCheckinStatusMock: vi.fn(),
}))

vi.mock('../api', () => ({
  getCheckinStatus: getCheckinStatusMock,
  performCheckin: vi.fn(),
}))

// The component reads `res.data` from the API envelope, so the mock must return
// the `{ success, data }` shape rather than a bare payload.
function ok(opts: {
  requireTopUp?: boolean
  hasToppedUp?: boolean
  checkedInToday?: boolean
}) {
  const checkedInToday = opts.checkedInToday ?? false
  return {
    success: true,
    message: '',
    data: {
      enabled: true,
      require_topup: opts.requireTopUp ?? false,
      has_topped_up: opts.hasToppedUp ?? false,
      stats: {
        checked_in_today: checkedInToday,
        total_checkins: checkedInToday ? 1 : 0,
        month_checkins: checkedInToday ? 1 : 0,
        total_quota: 0,
        consecutive_days: checkedInToday ? 1 : 0,
        records: [],
      },
      records: [],
    },
  }
}

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckinCalendarCard
        checkinEnabled
        turnstileEnabled={false}
        turnstileSiteKey=''
      />
    </QueryClientProvider>
  )
}

afterEach(() => vi.clearAllMocks())

describe('check-in top-up gate (business 6)', () => {
  it('blocks a user who has never topped up and explains why', async () => {
    getCheckinStatusMock.mockResolvedValue(
      ok({ requireTopUp: true, hasToppedUp: false })
    )

    renderCard()

    const button = await screen.findByRole('button', {
      name: 'Top-up Required',
    })
    expect(button).toBeDisabled()
    expect(
      screen.getByText(
        'Daily check-in is currently available only for users who have topped up or redeemed a code'
      )
    ).toBeVisible()
  })

  it('allows a user who has topped up', async () => {
    getCheckinStatusMock.mockResolvedValue(
      ok({ requireTopUp: true, hasToppedUp: true })
    )

    renderCard()

    const button = await screen.findByRole('button', { name: 'Check in now' })
    expect(button).toBeEnabled()
  })

  it('leaves the button usable when the top-up gate is off', async () => {
    getCheckinStatusMock.mockResolvedValue(
      ok({ requireTopUp: false, hasToppedUp: false })
    )

    renderCard()

    const button = await screen.findByRole('button', { name: 'Check in now' })
    expect(button).toBeEnabled()
  })

  it('greys out the button once the user already checked in today', async () => {
    getCheckinStatusMock.mockResolvedValue(
      ok({ requireTopUp: false, checkedInToday: true })
    )

    renderCard()

    const button = await screen.findByRole('button', { name: 'Checked in' })
    await waitFor(() => expect(button).toBeDisabled())
  })
})
