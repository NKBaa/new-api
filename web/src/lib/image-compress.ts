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
import { t } from 'i18next'

export interface ImageCompressOptions {
  maxDimension: number
  quality?: number
  allowIco?: boolean
  errorMsg?: string
}

/**
 * Validates and compresses an image file to a lightweight, high-definition Data URL.
 * Protects against SVG script injection and limits canvas dimensions to keep payloads light.
 */
export async function compressImageToDataUrl(
  file: File,
  options: ImageCompressOptions
): Promise<string> {
  const { maxDimension, quality = 0.88, allowIco = true } = options

  // Handle ICO
  if (
    file.type === 'image/x-icon' ||
    file.type === 'image/vnd.microsoft.icon' ||
    file.name.endsWith('.ico')
  ) {
    if (!allowIco) {
      throw new Error(t('ICO format is not allowed'))
    }
    if (file.size > 250 * 1024) {
      throw new Error(t('Icon file size must not exceed 250KB'))
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(reader.result as string))
      reader.addEventListener('error', () =>
        reject(new Error(t('Failed to read ICO file')))
      )
      reader.readAsDataURL(file)
    })
  }

  // Reject SVG for security reasons
  if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
    throw new Error(
      t('SVG format is not allowed for security reasons. Please use PNG, JPEG, WebP or ICO.')
    )
  }

  // Handle Raster Images (PNG, JPG, WebP)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const img = new Image()
      img.addEventListener('load', () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(reader.result as string)
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // Try WebP first, fallback to original or PNG
        try {
          const webpData = canvas.toDataURL('image/webp', quality)
          if (webpData.startsWith('data:image/webp')) {
            resolve(webpData)
            return
          }
        } catch {
          // ignore
        }

        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          resolve(canvas.toDataURL('image/jpeg', quality))
        } else {
          resolve(canvas.toDataURL('image/png'))
        }
      })
      img.addEventListener('error', () => {
        reject(new Error(options.errorMsg || t('Failed to decode image')))
      })
      img.src = reader.result as string
    })
    reader.addEventListener('error', () => {
      reject(new Error(t('Failed to read image file')))
    })
    reader.readAsDataURL(file)
  })
}
