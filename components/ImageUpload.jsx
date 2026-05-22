'use client'

import { useState, useRef } from 'react'
import imageCompression from 'browser-image-compression'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, Link2, X, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeImageSrc } from '@/lib/imageUtils'

/**
 * Reusable image uploader.
 *  - Accepts a file from the gallery (drag&drop, file picker)
 *  - Auto-compresses with browser-image-compression (target ~600KB, max 1600px)
 *  - Supports a URL input as alternative
 *  - Returns base64 (data:image/...) or URL through onChange
 *
 * Props:
 *   value         - current value (base64/url)
 *   onChange      - function(newValue)
 *   aspect        - 'square' | 'wide' | 'cover'  (preview aspect ratio)
 *   label         - text label
 *   maxSizeMB     - max compressed size in MB (default 0.6 = ~600KB)
 *   maxWidth      - max width px (default 1600)
 */
export default function ImageUpload({
  value,
  onChange,
  aspect = 'square',
  label = 'Imagen',
  maxSizeMB = 0.6,
  maxWidth = 1600,
}) {
  const inputRef = useRef(null)
  const [mode, setMode] = useState('upload') // 'upload' | 'url'
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const aspectClass = {
    square: 'aspect-square',
    wide: 'aspect-video',
    cover: 'aspect-[3/1]',
  }[aspect] || 'aspect-square'

  const handleFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen válido')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      const originalSizeKB = (file.size / 1024).toFixed(0)

      const options = {
        maxSizeMB,
        maxWidthOrHeight: maxWidth,
        useWebWorker: true,
        initialQuality: 0.85,
        onProgress: (p) => setProgress(p),
      }

      const compressed = await imageCompression(file, options)
      const compressedSizeKB = (compressed.size / 1024).toFixed(0)

      // Convert to base64
      const base64 = await imageCompression.getDataUrlFromFile(compressed)
      onChange(base64)

      toast.success(`Imagen lista (${originalSizeKB}KB → ${compressedSizeKB}KB)`)
    } catch (err) {
      console.error('Error compressing image:', err)
      toast.error('Error al procesar la imagen')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const clearImage = () => onChange('')

  const previewSrc = value ? normalizeImageSrc(value) : ''

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}

      {/* Toggle buttons */}
      <div className="inline-flex rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
            mode === 'upload'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Subir
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
            mode === 'url'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          URL
        </button>
      </div>

      {/* URL input */}
      {mode === 'url' && (
        <Input
          placeholder="https://... o link de Google Drive"
          value={typeof value === 'string' && !value.startsWith('data:') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {/* Upload zone */}
      {mode === 'upload' && (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`relative ${aspectClass} w-full max-w-sm rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/50 transition cursor-pointer flex items-center justify-center overflow-hidden group`}
        >
          {previewSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation()
                    inputRef.current?.click()
                  }}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Cambiar
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearImage()
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Comprimiendo... {progress}%</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Haz clic para subir</p>
              <p className="text-xs">o arrastra una imagen</p>
              <p className="text-[10px] opacity-70">Se comprimirá automáticamente</p>
            </div>
          )}
        </div>
      )}

      {/* URL preview */}
      {mode === 'url' && value && (
        <div className={`${aspectClass} max-w-sm rounded-xl overflow-hidden bg-muted/30 border`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
