/*
Regression tests for the pseudo-200 channel settings locale wiring.

Guards a real defect: locale entries had been appended outside the
"translation" namespace in web/src/i18n/locales/*.json. i18next resolves
json.translation["Pseudo-200 detection"], so lookup returned undefined and the
Chinese UI displayed the raw English key instead of the translation.
*/
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { createAppQueryClient } from '@/lib/query-client'

import { channelSchema, type Channel } from '../../types'
import { ChannelsProvider } from '../channels-provider'
import { ChannelMutateDrawer } from '../drawers/channel-mutate-drawer'

const editingChannel: Channel = channelSchema.parse({
  id: 42,
  name: 'Existing channel',
  type: 1,
  key: 'sk-test',
  status: 1,
  created_time: 1,
  test_time: 0,
  response_time: 0,
  balance_updated_time: 0,
  models: 'gpt-4o',
  group: 'default',
  base_url: 'https://api.example.com',
  setting: '{}',
})

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url === '/api/channel/42') {
        return { data: { success: true, data: editingChannel } }
      }
      return { data: { success: true, data: [] } }
    }),
    put: vi.fn(async () => ({ data: { success: true } })),
  },
}))

const originalLanguage = i18n.language

beforeAll(async () => {
  // src/test-setup.ts initializes i18next globally with empty resources, so
  // register the real locale bundles here and switch to zh.
  i18n.addResourceBundle('en', 'translation', en.translation, true, true)
  i18n.addResourceBundle('zh', 'translation', zh.translation, true, true)
  await i18n.changeLanguage('zh')
})

afterAll(async () => {
  await i18n.changeLanguage(originalLanguage || 'en')
})

test('every locale entry lives inside the translation namespace', () => {
  // The root cause guard: a key at the JSON root is unreachable for i18next.
  for (const [name, resource] of Object.entries({ en, zh })) {
    expect(
      Object.keys(resource as Record<string, unknown>),
      `${name}.json should only expose the "translation" root key`
    ).toEqual(['translation'])
  }
})

test('the pseudo-200 controls render Chinese labels in the request tab', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <RouterContextProvider router={router}>
        <ChannelsProvider>
          <ChannelMutateDrawer
            open
            currentRow={editingChannel}
            onOpenChange={() => {}}
          />
        </ChannelsProvider>
      </RouterContextProvider>
    </QueryClientProvider>
  )

  await userEvent.setup().click(
    await screen.findByRole('tab', { name: /请求与响应/ })
  )

  expect(await screen.findByText('伪 200 异常检测')).toBeInTheDocument()
  expect(screen.queryByText('Pseudo-200 detection')).not.toBeInTheDocument()
})

test('the image upload and signature keys resolve instead of falling back to English', () => {
  expect(i18n.t('Custom blocking signatures')).toBe('自定义拦截特征')
  expect(
    i18n.t(
      'One signature per line, or separate them with commas. Leave blank to use only the built-in signatures.'
    )
  ).toContain('每行一个')
  expect(i18n.t('ICO format is not allowed')).toBe('ICO 格式不受支持')
  expect(i18n.t('Image file size must not exceed 10MB')).toContain('图片文件大小')
})
