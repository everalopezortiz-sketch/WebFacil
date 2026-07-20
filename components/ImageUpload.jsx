'use client'

import { useState, useRef } from 'react'
import imageCompression from 'browser-image-compression'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeImageSrc } from '@/lib/imageUtils'

/**
 * Reusable image uploader (gallery upload only).
 *  - Accepts a file from the gallery (drag&drop, file picker)
 *  - Auto-compresses with browser-image-compression
 *  - Returns base64 (data:image/...) through onChange
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
              onError={(e) => { e.target.style.display = 'none' }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
              >
                <Upload className="w-4 h-4 mr-1" /> Cambiar
              </Button>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                onClick={(e) => { e.stopPropagation(); clearImage() }}
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
            <p className="text-xs">o arrastra una imagen desde tu galería</p>
            <p className="text-[10px] opacity-70">Se comprimirá automáticamente</p>
          </div>
        )}
      </div>

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
