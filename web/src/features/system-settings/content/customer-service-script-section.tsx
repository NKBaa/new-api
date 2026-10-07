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
import { AlertCircle, Save, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseCustomerServiceScript } from '@/lib/customer-service-script'
import { handleServerError } from '@/lib/handle-server-error'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

interface CustomerServiceScriptSectionProps {
  enabled: boolean
  script: string
}

const MAX_SCRIPT_CHARS = 2000

/**
 * Third-party customer service widget configuration.
 *
 * Administrators paste either the vendor embed tag (for example MaxKB) or a
 * bare script URL. The value is validated locally so an obvious mistake is
 * caught before saving, and the server repeats the same validation as the
 * authoritative check.
 */
export function CustomerServiceScriptSection(
  props: CustomerServiceScriptSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const [isEnabled, setIsEnabled] = useState(props.enabled)
  const [scriptValue, setScriptValue] = useState(props.script)
  const [isSaving, setIsSaving] = useState(false)

  const [prevEnabled, setPrevEnabled] = useState(props.enabled)
  if (prevEnabled !== props.enabled) {
    setPrevEnabled(props.enabled)
    setIsEnabled(props.enabled)
  }

  const [prevScript, setPrevScript] = useState(props.script)
  if (prevScript !== props.script) {
    setPrevScript(props.script)
    setScriptValue(props.script)
  }

  const trimmed = scriptValue.trim()
  const parsed = trimmed ? parseCustomerServiceScript(trimmed) : null
  const isInvalid = trimmed !== '' && parsed === null
  const isTooLong = trimmed.length > MAX_SCRIPT_CHARS
  const hasChanges =
    isEnabled !== props.enabled || trimmed !== props.script.trim()

  const handleToggleEnabled = async (checked: boolean) => {
    if (checked && !parsed) {
      toast.error(t('Fill in a valid widget script or URL first'))
      return
    }
    if (checked && isTooLong) {
      toast.error(
        t('Widget script must be less than {{count}} characters', {
          count: MAX_SCRIPT_CHARS,
        })
      )
      return
    }
    setIsSaving(true)
    try {
      // Enabling is only meaningful once the script itself is stored, otherwise
      // the flag would be on while the site loads nothing. Save the pending
      // value first so one click leaves a consistent state.
      if (checked && trimmed !== props.script.trim()) {
        await updateOption.mutateAsync({
          key: 'console_setting.customer_service_script',
          value: trimmed,
        })
      }
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service_script_enabled',
        value: checked,
      })
      setIsEnabled(checked)
    } catch (error) {
      handleServerError(error, t('Failed to save settings'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (isInvalid) {
      toast.error(t('Fill in a valid widget script or URL first'))
      return
    }
    if (isTooLong) {
      toast.error(
        t('Widget script must be less than {{count}} characters', {
          count: MAX_SCRIPT_CHARS,
        })
      )
      return
    }
    setIsSaving(true)
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.customer_service_script',
        value: trimmed,
      })
    } catch (error) {
      handleServerError(error, t('Failed to save settings'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingsSection title={t('Third-party Customer Service Widget')}>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Embed an external customer service or AI assistant widget (such as MaxKB) on every page. Only external http(s) scripts are allowed; inline JavaScript is rejected.'
          )}
        </p>

        <Alert>
          <ShieldAlert aria-hidden='true' />
          <AlertTitle>{t('Only load scripts you trust')}</AlertTitle>
          <AlertDescription className='text-xs'>
            {t(
              'The script runs with full access to every page of this site, including the login and admin pages, and can read or modify anything a signed-in visitor can see. Only embed a vendor you trust, and prefer an official domain over a third-party mirror.'
            )}
          </AlertDescription>
        </Alert>

        <div className='space-y-2'>
          <Label htmlFor='customer-service-script'>
            {t('Widget Script or URL')}
          </Label>
          <Textarea
            id='customer-service-script'
            rows={4}
            spellCheck={false}
            className='font-mono text-xs'
            placeholder={t(
              'e.g. https://your-widget.example.com/embed.js?token=...'
            )}
            value={scriptValue}
            onChange={(event) => setScriptValue(event.target.value)}
          />
          {isInvalid ? (
            <p className='text-destructive flex items-center gap-1.5 text-xs'>
              <AlertCircle className='size-3.5' />
              {t(
                'Enter a complete <script src="..."> tag or an http(s) script URL. Inline scripts are not allowed.'
              )}
            </p>
          ) : (
            <p className='text-muted-foreground text-xs'>
              {t(
                'Paste the embed code copied from the vendor console, or just the script URL.'
              )}
            </p>
          )}
        </div>

        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            size='sm'
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isInvalid || isTooLong}
            className='bg-emerald-600 text-white hover:bg-emerald-700'
          >
            <Save className='mr-1.5 size-4' />
            {isSaving ? t('Saving...') : t('Save Settings')}
          </Button>
        </div>

        <SettingsSwitchField
          controlId='customer-service-script-enabled'
          label={t('Enable third-party customer service widget')}
          description={t(
            'When enabled, the widget script loads on every page of the site'
          )}
          checked={isEnabled}
          disabled={isSaving}
          onCheckedChange={handleToggleEnabled}
        />
      </div>
    </SettingsSection>
  )
}
