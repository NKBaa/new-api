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

import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { RichContent } from '@/components/rich-content'
import { useTheme } from '@/context/theme-provider'
import { useHomePageContent } from '@/features/home/hooks'
import { isLikelyHtml } from '@/lib/content-format'
import { useAuthStore } from '@/stores/auth-store'

import { CompatibleTools } from './components/compatible-tools'
import { CustomerService } from './components/customer-service'
import { CustomerServiceFloating } from './components/customer-service-floating'
import { FeaturesSummary } from './components/features-summary'
import { Hero } from './components/hero'
import { ModelBrowser } from './components/model-browser'
import { Quickstart } from './components/quickstart'
import { useLandingData } from './hooks/use-landing-data'

export function LandingV2() {
  const { i18n, t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user

  // 1. 获取后台设置的自定义首页内容（系统设置 -> 首页内容）
  const { content, isLoaded, isUrl } = useHomePageContent()

  const syncIframePreferences = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { themeMode: resolvedTheme },
        '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        { lang: i18n.language },
        '*'
      )
    } catch {
      // Cross-origin frames may reject access while navigating.
    }
  }, [i18n.language, resolvedTheme])

  useEffect(() => {
    if (isUrl) {
      syncIframePreferences()
    }
  }, [isUrl, syncIframePreferences])

  // 2. 获取默认 Landing V2 的数据
  const {
    apiBase,
    systemName,
    docsUrl,
    models,
    isLoading,
    primaryModel,
    totalModelsCount,
  } = useLandingData()

  // 3. 数据尚未加载完成时，展示极简占位以防止界面闪烁
  if (!isLoaded) {
    return (
      <PublicLayout showMainContainer={false}>
        <main className='flex min-h-screen items-center justify-center font-mono text-xs text-muted-foreground'>
          <div>{t('Loading...')}</div>
        </main>
      </PublicLayout>
    )
  }

  // 4. 原版核心逻辑：若后台配置了“首页内容”，完全沿用管理员设置的内容
  if (content) {
    // 4.1 如果配置的是远程 URL 地址，使用安全沙箱 iframe 嵌入
    if (isUrl) {
      return (
        <PublicLayout showMainContainer={false}>
          <iframe
            ref={iframeRef}
            src={content}
            className='h-screen w-full border-none'
            title={t('Custom Home Page')}
            sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
            onLoad={syncIframePreferences}
          />
        </PublicLayout>
      )
    }

    const contentIsHtml = isLikelyHtml(content)

    // 4.2 如果配置的是 HTML 代码（如用户自定义的 <div class="ca-home"><style>...）
    if (contentIsHtml) {
      return (
        <PublicLayout showMainContainer={false}>
          <RichContent
            mode='html'
            htmlVariant='isolated'
            content={content}
            className='custom-home-content'
          />
        </PublicLayout>
      )
    }

    // 4.3 如果配置的是标准 Markdown
    return (
      <PublicLayout>
        <div className='mx-auto max-w-6xl px-4 py-8'>
          <RichContent
            mode='markdown'
            content={content}
            className='custom-home-content'
          />
        </div>
      </PublicLayout>
    )
  }

  // 5. 若后台未配置自定义“首页内容”，则使用全新研发的 OpenRouter 极简高密度开发者首页
  return (
    <PublicLayout showMainContainer={false}>
      <div className='min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary'>
        {/* 极简 Hero 区域（动态挂载系统设置） */}
        <Hero
          isAuthenticated={isAuthenticated}
          apiBase={apiBase}
          systemName={systemName}
          docsUrl={docsUrl}
          totalModelsCount={totalModelsCount}
        />

        {/* 核心主角：实时模型目录与定价表格（带分页与条数控制） */}
        <ModelBrowser models={models} isLoading={isLoading} />

        {/* 开发者极速接入代码块（动态注入当前服务地址与可用模型） */}
        <Quickstart apiBase={apiBase} primaryModel={primaryModel} />

        {/* 兼容客户端生态列表（动态注入真实 Base URL） */}
        <CompatibleTools apiBase={apiBase} />

        {/* 架构特性小结 */}
        <FeaturesSummary />

        {/* 平台客服支持 */}
        <CustomerService />

        {/* 统一页脚 */}
        <Footer className='border-t-0' />
      </div>

      {/* 悬浮客服快捷挂件 */}
      <CustomerServiceFloating />
    </PublicLayout>
  )
}
