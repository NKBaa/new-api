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
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Image as ImageIcon,
  Link2,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWatch, type Resolver } from 'react-hook-form'
import { t } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { compressImageToDataUrl } from '@/lib/image-compress'

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import {
  SettingsForm,
  SettingsFormGrid,
  SettingsFormGridItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { isValidTaskPublicAddress } from './task-public-address'

const isValidImageUrlOrDataUrl = (val?: string) => {
  if (!val || val === '') return true
  if (val.startsWith('data:image/')) return true
  if (val.startsWith('/') || val.startsWith('./')) return true
  try {
    new URL(val)
    return true
  } catch {
    return false
  }
}

async function processLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !file.name.endsWith('.ico')) {
    throw new Error(t('Please select a valid image file (PNG, JPG, WebP, ICO)'))
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(t('Image file size must not exceed 10MB'))
  }
  return compressImageToDataUrl(file, {
    maxDimension: 256,
    quality: 0.9,
    allowIco: true,
    errorMsg: t('Failed to process logo file'),
  })
}

const _systemInfoSchema = z.object({
  SystemName: z.string().min(1),
  ServerAddress: z.string().optional(),
  TaskPublicAddress: z.string().refine(isValidTaskPublicAddress),
  Logo: z.string().max(500000).refine(isValidImageUrlOrDataUrl).optional().or(z.literal('')),
  Footer: z.string().optional(),
  About: z.string().optional(),
  HomePageContent: z.string().optional(),
  general_setting: z.object({
    docs_link: z.string(),
  }),
  legal: z.object({
    user_agreement: z.string().optional(),
    privacy_policy: z.string().optional(),
  }),
})

type SystemInfoFormValues = z.infer<typeof _systemInfoSchema>

type SystemInfoSectionProps = {
  defaultValues: SystemInfoFormValues
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

export function SystemInfoSection({ defaultValues }: SystemInfoSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const normalizedDefaults: SystemInfoFormValues = {
    SystemName: normalizeValue(defaultValues.SystemName),
    ServerAddress: normalizeValue(defaultValues.ServerAddress),
    TaskPublicAddress: normalizeValue(defaultValues.TaskPublicAddress),
    Logo: normalizeValue(defaultValues.Logo),
    Footer: normalizeValue(defaultValues.Footer),
    About: normalizeValue(defaultValues.About),
    HomePageContent: normalizeValue(defaultValues.HomePageContent),
    general_setting: {
      docs_link: normalizeValue(defaultValues.general_setting?.docs_link),
    },
    legal: {
      user_agreement: normalizeValue(defaultValues.legal?.user_agreement),
      privacy_policy: normalizeValue(defaultValues.legal?.privacy_policy),
    },
  }

  const systemInfoSchemaWithI18n = z.object({
    SystemName: z.string().min(1, {
      error: () => t('System name is required'),
    }),
    ServerAddress: z.string().optional(),
    TaskPublicAddress: z.string().refine(isValidTaskPublicAddress, {
      error: () =>
        t(
          'Enter an absolute HTTP(S) URL without credentials, query parameters, or fragments'
        ),
    }),
    Logo: z
      .string()
      .max(500000)
      .refine(isValidImageUrlOrDataUrl, {
        error: () => t('Please enter a valid image URL or upload an image'),
      })
      .optional()
      .or(z.literal('')),
    Footer: z.string().optional(),
    About: z.string().optional(),
    HomePageContent: z.string().optional(),
    general_setting: z.object({
      docs_link: z.string(),
    }),
    legal: z.object({
      user_agreement: z.string().optional(),
      privacy_policy: z.string().optional(),
    }),
  })

  const [inputMode, setInputMode] = useState<'upload' | 'url'>(() => {
    return defaultValues.Logo && !defaultValues.Logo.startsWith('data:')
      ? 'url'
      : 'upload'
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const [previewImageError, setPreviewImageError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm<SystemInfoFormValues>({
      resolver: zodResolver(systemInfoSchemaWithI18n) as Resolver<
        SystemInfoFormValues,
        unknown,
        SystemInfoFormValues
      >,
      defaultValues: normalizedDefaults,
      onSubmit: async (_data, changedFields) => {
        for (const [key, value] of Object.entries(changedFields)) {
          let v = normalizeValue(value)
          if (key === 'ServerAddress' || key === 'TaskPublicAddress') {
            v = v.replace(/\/+$/, '')
          }
          await updateOption.mutateAsync({
            key,
            value: v,
          })
        }
      },
    })

  const watchedLogoValue = useWatch({
    control: form.control,
    name: 'Logo',
    defaultValue: defaultValues.Logo || '',
  })
  const watchedLogo = watchedLogoValue ?? ''

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsProcessingImage(true)
      try {
        const dataUrl = await processLogoFile(file)
        form.setValue('Logo', dataUrl, { shouldDirty: true })
        setPreviewImageError(false)
        toast.success(t('Image uploaded successfully'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('Failed to process image'))
      } finally {
        setIsProcessingImage(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [form, t, setIsProcessingImage, setPreviewImageError]
  )

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            handleFileSelect(file)
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFileSelect])

  return (
    <>
      <FormNavigationGuard when={isDirty} />

      <SettingsSection title={t('System Information')}>
        <Form {...form}>
          <SettingsForm onSubmit={handleSubmit}>
            <SettingsPageFormActions
              onSave={handleSubmit}
              onReset={handleReset}
              isSaving={isSubmitting || updateOption.isPending}
              isResetDisabled={!isDirty}
            />
            <FormDirtyIndicator isDirty={isDirty} />
            <SettingsFormGrid>
              <FormField
                control={form.control}
                name='SystemName'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('System Name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('New API')} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t('The name displayed across the application')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='ServerAddress'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Server Address')}</FormLabel>
                    <FormControl>
                      <Input placeholder='https://yourdomain.com' {...field} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'The public URL of your server, used for OAuth callbacks, webhooks, and other external integrations'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='TaskPublicAddress'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Async Task Public Address')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://media.example.com/tasks'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Public base URL for async task media. Supports a dedicated media domain, port, or Nginx path prefix; falls back to Server Address when empty.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='general_setting.docs_link'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Documentation Link')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('https://docs.example.com')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Link to your documentation site')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SettingsFormGridItem span='full'>
                <FormField
                  control={form.control}
                  name='Logo'
                  render={({ field }) => (
                    <FormItem>
                      <div className='flex items-center justify-between'>
                        <FormLabel>{t('Logo')}</FormLabel>
                        {inputMode === 'upload' ? (
                          <Button
                            type='button'
                            variant='link'
                            size='sm'
                            className='h-auto p-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1'
                            onClick={() => setInputMode('url')}
                          >
                            <Link2 className='size-3' />
                            <span>{t('Switch to Image URL')}</span>
                          </Button>
                        ) : (
                          <Button
                            type='button'
                            variant='link'
                            size='sm'
                            className='h-auto p-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1'
                            onClick={() => setInputMode('upload')}
                          >
                            <Upload className='size-3' />
                            <span>{t('Switch to Local Upload')}</span>
                          </Button>
                        )}
                      </div>

                      <FormControl>
                        <div>
                          {/* Hidden native file input */}
                          <input
                            ref={fileInputRef}
                            type='file'
                            accept='image/png,image/jpeg,image/webp,image/x-icon'
                            className='hidden'
                            onChange={handleFileInputChange}
                          />

                          {/* If Logo is set, display preview card */}
                          {Boolean(watchedLogo && watchedLogo.trim() !== '') && (
                            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3.5'>
                              <div className='flex items-center gap-3.5 min-w-0'>
                                <div className='flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5 dark:bg-black/40'>
                                  {!previewImageError ? (
                                    <img
                                      src={watchedLogo.trim()}
                                      alt='Logo Preview'
                                      className='size-full object-contain'
                                      onError={() => setPreviewImageError(true)}
                                    />
                                  ) : (
                                    <span className='text-[10px] text-destructive'>
                                      {t('Failed to load image, please check if the URL is valid and accessible')}
                                    </span>
                                  )}
                                </div>
                                <div className='min-w-0 space-y-0.5'>
                                  <div className='flex items-center gap-1.5'>
                                    <ImageIcon className='size-3.5 text-emerald-500 shrink-0' />
                                    <span className='text-xs font-medium text-foreground truncate'>
                                      {watchedLogo.startsWith('data:')
                                        ? t('Local uploaded image')
                                        : t('Network image URL')}
                                    </span>
                                  </div>
                                  <p className='text-xs text-muted-foreground truncate max-w-md'>
                                    {watchedLogo.startsWith('data:')
                                      ? 'Base64 Data URL'
                                      : watchedLogo}
                                  </p>
                                </div>
                              </div>
                              <div className='flex items-center gap-2 shrink-0 self-end sm:self-center'>
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  className='h-8 text-xs gap-1.5'
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={isProcessingImage}
                                >
                                  {isProcessingImage ? (
                                    <Loader2 className='size-3.5 animate-spin' />
                                  ) : (
                                    <Upload className='size-3.5' />
                                  )}
                                  <span>{t('Replace Image')}</span>
                                </Button>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='sm'
                                  className='h-8 text-xs text-destructive hover:text-destructive gap-1.5'
                                  onClick={() => {
                                    field.onChange('')
                                    setPreviewImageError(false)
                                  }}
                                >
                                  <Trash2 className='size-3.5' />
                                  <span>{t('Remove Image')}</span>
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Drag & Drop Zone when empty and in upload mode */}
                          {!watchedLogo && inputMode === 'upload' && (
                            <div
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              onClick={() => fileInputRef.current?.click()}
                              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 px-4 text-center cursor-pointer transition-colors ${
                                isDragging
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/60 hover:bg-muted/30'
                              }`}
                            >
                              {isProcessingImage ? (
                                <div className='flex flex-col items-center gap-2 py-3 text-xs text-muted-foreground'>
                                  <Loader2 className='size-6 animate-spin text-primary' />
                                  <span>{t('Processing image...')}</span>
                                </div>
                              ) : (
                                <>
                                  <div className='flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2'>
                                    <Upload className='size-4' />
                                  </div>
                                  <div className='text-sm font-medium text-foreground'>
                                    {t('Click or drag logo image here')}
                                  </div>
                                  <div className='mt-1 text-xs text-muted-foreground'>
                                    {t('Supports PNG, JPG, WebP, ICO (Ctrl+V to paste screenshot)')}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Manual URL Input when empty and in URL mode */}
                          {!watchedLogo && inputMode === 'url' && (
                            <Input
                              placeholder={t('https://example.com/logo.png')}
                              value={field.value || ''}
                              onChange={(e) => {
                                field.onChange(e)
                                setPreviewImageError(false)
                              }}
                            />
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        {t('System logo image (local upload will be automatically optimized, or provide a URL)')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SettingsFormGridItem>

              <FormField
                control={form.control}
                name='Footer'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Footer')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          '© 2025 Your Company. All rights reserved.'
                        )}
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Footer text displayed at the bottom of pages')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='About'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('About')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          'Enter HTML code (e.g., <p>About us...</p>) or a URL (e.g., https://example.com) to embed as iframe'
                        )}
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Supports HTML markup or iframe embedding. Enter HTML code directly, or provide a complete URL to automatically embed it as an iframe.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SettingsFormGridItem span='full'>
                <FormField
                  control={form.control}
                  name='HomePageContent'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Home Page Content')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('Welcome to our New API...')}
                          rows={6}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Content displayed on the home page (supports Markdown)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SettingsFormGridItem>

              <FormField
                control={form.control}
                name='legal.user_agreement'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('User Agreement')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          'Provide Markdown, HTML, or an external URL for the user agreement'
                        )}
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Leave empty to disable the agreement requirement. Supports Markdown, HTML, or a full URL to redirect users.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='legal.privacy_policy'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Privacy Policy')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t(
                          'Provide Markdown, HTML, or an external URL for the privacy policy'
                        )}
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Leave empty to disable the privacy policy requirement. Supports Markdown, HTML, or a full URL to redirect users.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SettingsFormGrid>
          </SettingsForm>
        </Form>
      </SettingsSection>
    </>
  )
}
