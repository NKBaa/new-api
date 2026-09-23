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
  Plus,
  Trash2,
  Save,
  QrCode,
  ExternalLink,
  Image as ImageIcon,
  Upload,
  Link2,
  Loader2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { handleServerError } from '@/lib/handle-server-error'
import { compressImageToDataUrl } from '@/lib/image-compress'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

export interface CustomerServicePreset {
  id: number
  title: string
  contact?: string
  description?: string
  qrcode?: string
  link?: string
  color?: string
}

interface CustomerServiceSectionProps {
  enabled: boolean
  data: string
}

const customerServiceSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
  contact: z.string().max(200, 'Contact must be less than 200 characters').optional().or(z.literal('')),
  description: z.string().max(500, 'Description must be less than 500 characters').optional().or(z.literal('')),
  qrcode: z
    .string()
    .max(500000, 'QR Code image or URL is too large')
    .refine((val) => !val || (!val.toLowerCase().includes('<script') && !val.toLowerCase().includes('javascript:')), {
      message: 'QR Code contains invalid content',
    })
    .optional()
    .or(z.literal('')),
  link: z
    .string()
    .max(1000, 'Link must be less than 1000 characters')
    .refine((val) => !val || !val.toLowerCase().trim().startsWith('javascript:'), {
      message: 'Invalid link protocol',
    })
    .optional()
    .or(z.literal('')),
})

async function processImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (PNG, JPG, WebP, SVG)')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image file size must not exceed 10MB')
  }
  return compressImageToDataUrl(file, {
    maxDimension: 500,
    quality: 0.88,
    allowSvg: true,
    errorMsg: 'Failed to process QR code image',
  })
}

type CustomerServiceFormValues = z.infer<typeof customerServiceSchema>

const CS_FORM_ID = 'customer-service-form'

export function CustomerServiceSection({ enabled, data }: CustomerServiceSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [csList, setCsList] = useState<CustomerServicePreset[]>(() => {
    try {
      const parsed = JSON.parse(data || '[]')
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => ({
          ...item,
          id: item.id || idx + 1,
        }))
      }
    } catch {
      // ignore
    }
    return []
  })
  const [isEnabled, setIsEnabled] = useState(enabled)

  const [prevData, setPrevData] = useState(data)
  if (prevData !== data) {
    setPrevData(data)
    try {
      const parsed = JSON.parse(data || '[]')
      if (Array.isArray(parsed)) {
        setCsList(
          parsed.map((item, idx) => ({
            ...item,
            id: item.id || idx + 1,
          }))
        )
      } else {
        setCsList([])
      }
    } catch {
      setCsList([])
    }
  }

  const [prevEnabled, setPrevEnabled] = useState(enabled)
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled)
    setIsEnabled(enabled)
  }

  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<CustomerServicePreset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')
  const [previewImageError, setPreviewImageError] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload')
  const [isProcessingImage, setIsProcessingImage] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<CustomerServiceFormValues>({
    resolver: zodResolver(customerServiceSchema),
    defaultValues: {
      title: '',
      contact: '',
      description: '',
      qrcode: '',
      link: '',
    },
  })

  const watchedQrcode = useWatch({
    control: form.control,
    name: 'qrcode',
    defaultValue: '',
  })

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsProcessingImage(true)
      try {
        const dataUrl = await processImageFile(file)
        form.setValue('qrcode', dataUrl, { shouldDirty: true })
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
    [form, t]
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
    if (!showDialog) return
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
  }, [showDialog, handleFileSelect])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch (error) {
      handleServerError(error, t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    setPreviewImageError(false)
    setInputMode('upload')
    form.reset({
      title: '',
      contact: '',
      description: '',
      qrcode: '',
      link: '',
    })
    setShowDialog(true)
  }

  const handleEdit = (item: CustomerServicePreset) => {
    setEditingItem(item)
    setPreviewImageError(false)
    setInputMode(item.qrcode && !item.qrcode.startsWith('data:') ? 'url' : 'upload')
    form.reset({
      title: item.title,
      contact: item.contact || '',
      description: item.description || '',
      qrcode: item.qrcode || '',
      link: item.link || '',
    })
    setShowDialog(true)
  }

  const handleDelete = (item: CustomerServicePreset) => {
    setEditingItem(item)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    let updatedList: CustomerServicePreset[] = []
    if (deleteTarget === 'single' && editingItem) {
      updatedList = csList.filter((item) => item.id !== editingItem.id)
    } else if (deleteTarget === 'batch') {
      updatedList = csList.filter((item) => !selectedIds.includes(item.id))
      setSelectedIds([])
    }
    setCsList(updatedList)
    setShowDeleteDialog(false)
    setEditingItem(null)

    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service',
        value: JSON.stringify(updatedList),
      })
      setHasChanges(false)
      toast.success(t('Settings saved successfully'))
    } catch (error) {
      setHasChanges(true)
      handleServerError(error, t('Failed to save settings'))
    }
  }

  const handleSubmitForm = async (values: CustomerServiceFormValues) => {
    setIsSaving(true)
    let updatedList: CustomerServicePreset[] = []
    if (editingItem) {
      updatedList = csList.map((item) =>
        item.id === editingItem.id ? { ...item, ...values } : item
      )
    } else {
      const newId = Math.max(...csList.map((item) => item.id), 0) + 1
      updatedList = [...csList, { id: newId, ...values }]
    }
    setCsList(updatedList)

    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service',
        value: JSON.stringify(updatedList),
      })
      setHasChanges(false)
      toast.success(t('Settings saved successfully'))
      setShowDialog(false)
      setEditingItem(null)
    } catch (error) {
      setHasChanges(true)
      handleServerError(error, t('Failed to save settings'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service',
        value: JSON.stringify(csList),
      })
      setHasChanges(false)
      toast.success(t('Settings saved successfully'))
    } catch (error) {
      handleServerError(error, t('Failed to save settings'))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? csList.map((item) => item.id) : [])
  }

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  const columns: StaticDataTableColumn<CustomerServicePreset>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          checked={selectedIds.length === csList.length && csList.length > 0}
          onCheckedChange={handleSelectAll}
          aria-label={t('Select all')}
        />
      ),
      className: 'w-12',
      cell: (item) => (
        <Checkbox
          checked={selectedIds.includes(item.id)}
          onCheckedChange={(checked) =>
            handleSelectOne(item.id, checked as boolean)
          }
          aria-label={t('Select row')}
        />
      ),
    },
    {
      id: 'title',
      header: t('Customer Service Name'),
      cell: (item) => (
        <div className='flex items-center gap-2 font-medium'>
          <span>{item.title}</span>
          {item.qrcode && (
            <Badge variant='outline' className='gap-1 text-[10px] px-1.5 py-0'>
              <QrCode className='size-3 text-emerald-500' />
              <span>{t('QR Code')}</span>
            </Badge>
          )}
          {item.link && (
            <Badge variant='outline' className='gap-1 text-[10px] px-1.5 py-0'>
              <ExternalLink className='size-3 text-blue-500' />
              <span>{t('Link')}</span>
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'contact',
      header: t('Contact Info'),
      cell: (item) => (
        <span className='font-mono text-xs text-muted-foreground'>
          {item.contact || '-'}
        </span>
      ),
    },
    {
      id: 'description',
      header: t('Description / Working Hours'),
      cell: (item) => (
        <span className='line-clamp-2 text-xs text-muted-foreground'>
          {item.description || '-'}
        </span>
      ),
    },
    {
      id: 'qrcode_thumb',
      header: t('QR Preview'),
      cell: (item) => {
        if (!item.qrcode) {
          return <span className='text-xs text-muted-foreground/40'>-</span>
        }
        return (
          <img
            src={item.qrcode}
            alt={item.title}
            className='size-8 rounded border border-border object-contain bg-white/5'
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      className: 'w-24 text-right',
      cell: (item) => (
        <StaticRowActions
          editLabel={t('Edit')}
          deleteLabel={t('Delete')}
          menuLabel={t('Open menu')}
          onEdit={() => handleEdit(item)}
          onDelete={() => handleDelete(item)}
        />
      ),
    },
  ]

  return (
    <SettingsSection title={t('Customer Service Presets')}>
      <div className='space-y-6'>
        <SettingsSwitchField
          label={t('Enable customer service preset')}
          description={t(
            'Display customer service contacts, support information, and QR codes on the homepage and console'
          )}
          checked={isEnabled}
          onCheckedChange={handleToggleEnabled}
        />

        {isEnabled && (
          <div className='space-y-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <Button size='sm' onClick={handleAdd}>
                  <Plus className='mr-1.5 size-4' />
                  {t('Add Customer Service')}
                </Button>
                {selectedIds.length > 0 && (
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={handleBatchDelete}
                  >
                    <Trash2 className='mr-1.5 size-4' />
                    {t('Delete Selected ({{count}})', {
                      count: selectedIds.length,
                    })}
                  </Button>
                )}
              </div>

              {hasChanges && (
                <Button
                  size='sm'
                  onClick={handleSaveSettings}
                  className='bg-emerald-600 hover:bg-emerald-700 text-white'
                >
                  <Save className='mr-1.5 size-4' />
                  {t('Save Settings')}
                </Button>
              )}
            </div>

            <StaticDataTable
              columns={columns}
              data={csList}
              getRowKey={(item) => item.id}
              emptyContent={t('No customer service presets configured yet. Click "Add Customer Service" to create one.')}
            />
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog
          open={showDialog}
          onOpenChange={(open) => {
            if (!isSaving) {
              setShowDialog(open)
              if (!open) setEditingItem(null)
            }
          }}
          title={
            editingItem
              ? t('Edit Customer Service Preset')
              : t('Add Customer Service Preset')
          }
          footer={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  setShowDialog(false)
                  setEditingItem(null)
                }}
                disabled={isSaving}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                form={CS_FORM_ID}
                disabled={isSaving || isProcessingImage}
              >
                {isSaving ? (
                  <>
                    <Loader2 className='mr-2 size-4 animate-spin' />
                    {t('Saving...')}
                  </>
                ) : (
                  t('Save')
                )}
              </Button>
            </>
          }
        >
          <Form {...form}>
            <form
              id={CS_FORM_ID}
              onSubmit={form.handleSubmit(handleSubmitForm)}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Customer Service Name')} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. Official WeChat Support / Telegram Support')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Display title for this customer service item')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='contact'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Contact Account / Number')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. WeChat ID, QQ Group No., or Email')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Account or contact information that users can easily copy')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Description / Working Hours')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('e.g. Mon-Sun 09:00 - 22:00 online response')}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Working hours or notes regarding this support channel')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='qrcode'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center justify-between'>
                      <FormLabel>{t('QR Code Image')}</FormLabel>
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
                          accept='image/png,image/jpeg,image/webp,image/svg+xml'
                          className='hidden'
                          onChange={handleFileInputChange}
                        />

                        {/* If QR Code is set, display preview card */}
                        {Boolean(watchedQrcode && watchedQrcode.trim() !== '') && (
                          <div className='rounded-xl border border-border bg-muted/20 p-4 space-y-3'>
                            <div className='flex items-center justify-between gap-2'>
                              <div className='flex items-center gap-2'>
                                <ImageIcon className='size-4 text-emerald-500' />
                                <span className='text-xs font-medium text-foreground'>
                                  {watchedQrcode.startsWith('data:')
                                    ? t('Local uploaded image')
                                    : t('Network image URL')}
                                </span>
                              </div>
                              <div className='flex items-center gap-1'>
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='sm'
                                  className='h-7 text-xs gap-1'
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={isProcessingImage}
                                >
                                  {isProcessingImage ? (
                                    <Loader2 className='size-3 animate-spin' />
                                  ) : (
                                    <Upload className='size-3' />
                                  )}
                                  <span>{t('Replace Image')}</span>
                                </Button>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='sm'
                                  className='h-7 text-xs text-destructive hover:text-destructive gap-1'
                                  onClick={() => {
                                    field.onChange('')
                                    setPreviewImageError(false)
                                  }}
                                >
                                  <Trash2 className='size-3' />
                                  <span>{t('Remove Image')}</span>
                                </Button>
                              </div>
                            </div>

                            <div className='flex items-center justify-center p-3 rounded-lg border border-border bg-white dark:bg-black/30'>
                              {!previewImageError ? (
                                <img
                                  src={watchedQrcode.trim()}
                                  alt='QR Code Preview'
                                  className='size-36 max-w-full object-contain rounded'
                                  onError={() => setPreviewImageError(true)}
                                />
                              ) : (
                                <div className='py-6 text-center text-xs text-destructive'>
                                  {t('Failed to load image, please check if the URL is valid and accessible')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Drag & Drop Zone when empty and in upload mode */}
                        {!watchedQrcode && inputMode === 'upload' && (
                          <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                              isDragging
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/60 hover:bg-muted/30'
                            }`}
                          >
                            {isProcessingImage ? (
                              <div className='flex flex-col items-center gap-2 py-4 text-xs text-muted-foreground'>
                                <Loader2 className='size-8 animate-spin text-primary' />
                                <span>{t('Processing image...')}</span>
                              </div>
                            ) : (
                              <>
                                <div className='flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3'>
                                  <Upload className='size-5' />
                                </div>
                                <div className='text-sm font-medium text-foreground'>
                                  {t('Click or drag QR code image here')}
                                </div>
                                <div className='mt-1 text-xs text-muted-foreground'>
                                  {t('Supports PNG, JPG, WebP, SVG (Ctrl+V to paste screenshot)')}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Manual URL Input when empty and in URL mode */}
                        {!watchedQrcode && inputMode === 'url' && (
                          <Input
                            placeholder='https://example.com/support-qr.png'
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
                      {t('Image of the QR code (local upload will be automatically optimized, or provide a URL)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='link'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Action Link URL (Optional)')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://t.me/support'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Direct link for one-click redirect (e.g. Telegram link, Work WeChat invite link)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget === 'single'
                  ? t('This customer service preset will be removed.')
                  : t('{{count}} presets will be removed from the list.', {
                      count: selectedIds.length,
                    })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>
                {t('Delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  )
}
