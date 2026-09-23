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

import { Check, Copy } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

interface QuickstartProps {
  apiBase: string
  primaryModel: string
}

export function Quickstart({ apiBase, primaryModel }: QuickstartProps) {
  const { t } = useTranslation()
  const [activeLang, setActiveLang] = useState<'curl' | 'python' | 'javascript'>('curl')
  const { isCopied, copyToClipboard } = useCopyToClipboard()

  const snippets = useMemo(() => {
    const modelName = primaryModel || '<model_name>'
    return {
      curl: `curl ${apiBase}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "${modelName}",
    "messages": [{"role": "user", "content": "Write an LRU cache in Go."}]
  }'`,
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${apiBase}",
    api_key="sk-your-api-key",
)

completion = client.chat.completions.create(
    model="${modelName}",
    messages=[{"role": "user", "content": "Hello, world!"}],
)
print(completion.choices[0].message.content)`,
      javascript: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${apiBase}',
  apiKey: 'sk-your-api-key',
});

const response = await client.chat.completions.create({
  model: '${modelName}',
  messages: [{ role: 'user', content: 'Explain raft consensus algorithm.' }],
});
console.log(response.choices[0].message.content);`,
    }
  }, [apiBase, primaryModel])

  const handleCopy = async () => {
    const success = await copyToClipboard(snippets[activeLang])
    if (success) {
      toast.success(t('Code snippet copied to clipboard'))
    }
  }

  const langs: { key: 'curl' | 'python' | 'javascript'; label: string }[] = [
    { key: 'curl', label: 'cURL' },
    { key: 'python', label: 'Python' },
    { key: 'javascript', label: 'TypeScript' },
  ]

  return (
    <section className='py-12 md:py-16'>
      <div className='mx-auto max-w-4xl px-6'>
        <div className='mb-6'>
          <h2 className='text-xl font-bold tracking-tight text-foreground font-mono sm:text-2xl'>
            {t('Developer Quickstart')}
          </h2>
          <p className='text-sm text-muted-foreground mt-1'>
            {t('Seamlessly compatible with the official OpenAI SDK. Just swap the baseURL and API key.')}
          </p>
        </div>

        {/* 极简代码容器 */}
        <div className='rounded-lg border border-border bg-card overflow-hidden shadow-xs'>
          {/* 语言切换栏 */}
          <div className='flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5'>
            <div className='flex items-center gap-1'>
              {langs.map((item) => (
                <button
                  type='button'
                  key={item.key}
                  onClick={() => setActiveLang(item.key)}
                  className={`rounded px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer ${
                    activeLang === item.key
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type='button'
              onClick={handleCopy}
              className='inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer'
            >
              {isCopied ? (
                <>
                  <Check className='size-3.5 text-emerald-500' />
                  <span className='text-emerald-500'>{t('Copied')}</span>
                </>
              ) : (
                <>
                  <Copy className='size-3.5' />
                  <span>{t('Copy code')}</span>
                </>
              )}
            </button>
          </div>

          {/* 代码内容 */}
          <div className='p-4 overflow-x-auto'>
            <pre className='font-mono text-xs leading-relaxed text-foreground/90'>
              <code>{snippets[activeLang]}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
