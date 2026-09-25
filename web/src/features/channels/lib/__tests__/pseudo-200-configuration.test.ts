/*
Verifies the per-channel pseudo-200 setting participates in the channel
configuration summary, so enabling it marks Request & Response as configured
exactly like the neighbouring official request-processing fields.
*/
import { expect, test } from 'vitest'

import { CHANNEL_FORM_DEFAULT_VALUES } from '../channel-form'
import { getChannelConfigurationState } from '../channel-configuration'

function state(patch: Record<string, unknown>) {
  const values = {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'probe',
    type: 1,
    key: 'k',
    models: 'gpt-4o',
    ...patch,
  }
  return getChannelConfigurationState(values as never, {} as never, true)
}

test('enabling pseudo-200 detection marks the request block as configured', () => {
  expect(state({ pseudo_200_enabled: false }).blocks.requestProcessing).toBe(
    'idle'
  )
  expect(state({ pseudo_200_enabled: true }).blocks.requestProcessing).toBe(
    'configured'
  )
})

test('custom signatures alone do not mark the block configured while the switch is off', () => {
  const onlyKeywords = state({
    pseudo_200_enabled: false,
    pseudo_200_custom_keywords: 'sig',
  })
  expect(onlyKeywords.blocks.requestProcessing).toBe('idle')
})
