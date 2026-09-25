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
import { describe, expect, test } from 'vitest'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { formatModelName } from '../format'

// Business 3: response-model diagnostics are an admin-only audit capability.
// Regular users must only ever see the model they asked for, never the mapped
// upstream model or the actual returned model.
function log(other: LogOtherData, modelName = 'requested-model'): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type: 2,
    content: '',
    username: 'user',
    token_name: 'token',
    model_name: modelName,
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

const mappedUpstream: LogOtherData = {
  is_model_mapped: true,
  upstream_model_name: 'provider-internal-mapped-model',
  response_model: {
    requested_model: 'requested-model',
    upstream_model: 'provider-internal-mapped-model',
    returned_model: 'unexpected-versioned-model',
  },
}

const adminMappedUpstream: LogOtherData = {
  admin_info: {
    is_model_mapped: true,
    upstream_model_name: 'provider-internal-mapped-model',
    response_model: {
      requested_model: 'requested-model',
      upstream_model: 'provider-internal-mapped-model',
      returned_model: 'unexpected-versioned-model',
    },
  },
}

describe('formatModelName admin isolation', () => {
  test('regular users never receive mapping or returned-model details', () => {
    const plain = formatModelName(log(mappedUpstream), false)
    expect(plain.name).toBe('requested-model')
    expect(plain.isMapped).toBe(false)
    expect(plain.actualModel).toBeUndefined()
    expect(plain.responseModel).toBeUndefined()
  })

  test('regular users are still shielded when admin_info is present in the payload', () => {
    const plain = formatModelName(log(adminMappedUpstream), false)
    expect(plain.name).toBe('requested-model')
    expect(plain.isMapped).toBe(false)
    expect(plain.actualModel).toBeUndefined()
    expect(plain.responseModel).toBeUndefined()
  })

  test('admins see the mapped upstream model and the returned model', () => {
    const admin = formatModelName(log(adminMappedUpstream), true)
    expect(admin.name).toBe('requested-model')
    expect(admin.isMapped).toBe(true)
    expect(admin.actualModel).toBe('provider-internal-mapped-model')
    expect(admin.responseModel?.returned_model).toBe('unexpected-versioned-model')
  })

  test('admins still read legacy top-level keys for older log rows', () => {
    const admin = formatModelName(log(mappedUpstream), true)
    expect(admin.isMapped).toBe(true)
    expect(admin.actualModel).toBe('provider-internal-mapped-model')
    expect(admin.responseModel?.returned_model).toBe('unexpected-versioned-model')
  })

  test('absence of a caller flag defaults to the shielded projection', () => {
    const fallback = formatModelName(log(adminMappedUpstream))
    expect(fallback.isMapped).toBe(false)
    expect(fallback.actualModel).toBeUndefined()
    expect(fallback.responseModel).toBeUndefined()
  })
})
