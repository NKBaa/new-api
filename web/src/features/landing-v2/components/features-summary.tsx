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
*/

import { useTranslation } from 'react-i18next'

export function FeaturesSummary() {
  const { t } = useTranslation()

  const items = [
    {
      title: 'Automated Fallback',
      desc: 'Multi-channel intelligent health probing with zero-downtime failover.',
    },
    {
      title: 'Exact Token Billing',
      desc: 'Accurate billing based on real token usage with multi-currency support.',
    },
    {
      title: 'Universal API Protocol',
      desc: 'Standard /v1 protocol bridging Claude, Gemini, DeepSeek, and more.',
    },
    {
      title: 'Low-Latency Edge BGP',
      desc: 'Multi-region accelerated network edge reducing first-token latency.',
    },
  ]

  return (
    <section className='py-12'>
      <div className='mx-auto max-w-6xl px-6'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'>
          {items.map((item) => (
            <div key={item.title} className='flex flex-col'>
              <div className='font-mono font-bold text-sm text-foreground'>
                {t(item.title)}
              </div>
              <p className='mt-1.5 text-xs text-muted-foreground leading-relaxed'>
                {t(item.desc)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
