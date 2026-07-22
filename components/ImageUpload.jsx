'use client'

import { useState, useRef } from 'react'
import imageCompression from 'browser-image-compression'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeImageSrc } from '@/lib/imageUtils'
import { createClient } from '@/lib/supabase'

const BUCKET = 'webfacil-images'
const ACCEPTED = 'image/avif,image/gif,image/jpeg,image/png,image/webp'
const ACCEPTED_SET = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

/**
 * Reusable image uploader.
 *  - Compresses in the browser
 *  - Uploads to Supabase Storage bucket (public) under {user_id}/{folder}/...
 *  - Returns the PUBLIC URL through onChange (never base64 in DB)
 *
 * Props:
 *  - folder: storage sub-path, e.g. "products", "settings/logo", "settings/cover", "settings/payment-qr"
 */
export default function ImageUpload({
  value,
  onChange,
  folder = 'products',
  aspect = 'square',
  label = 'Imagen',
  maxSizeMB = 0.6,
  maxWidth = 1600,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const supabase = createClient()

  const aspectClass = {
    square: 'aspect-square',
    wide: 'aspect-video',
    cover: 'aspect-[3/1]',
  }[aspect] || 'aspect-square'

  const handleFile = async (file) => {
    if (!file) return
    if (!ACCEPTED_SET.has(file.type)) {
      toast.error('Formato no permitido. Usa AVIF, GIF, JPEG, PNG o WebP')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      const originalSizeKB = (file.size / 1024).toFixed(0)

      // Compress + convert to WebP for maximum savings
      const options = {
        maxSizeMB,
        maxWidthOrHeight: maxWidth,
        useWebWorker: true,
        initialQuality: 0.82,
        fileType: 'image/webp',
        onProgress: (p) => setProgress(p),
      }
      const compressed = await imageCompression(file, options)
      const compressedSizeKB = (compressed.size / 1024).toFixed(0)

      // Resolve current user for the storage path (RLS restricts writes to owner)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Sesión expirada, vuelve a iniciar sesión')
        return
      }

      const now = new Date()
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
      const objectPath = `${user.id}/${cleanFolder}/${dateStr}-${uuid}.webp`

      const { error: uploadError } = await supabase
        .storage
        .from(BUCKET)
        .upload(objectPath, compressed, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: false,
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        toast.error('Error al subir la imagen')
        return
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
      const publicUrl = pub?.publicUrl
      if (!publicUrl) {
        toast.error('No se pudo obtener la URL pública')
        return
      }

      onChange(publicUrl)
      toast.success(`Imagen subida (${originalSizeKB}KB → ${compressedSizeKB}KB)`)
    } catch (err) {
      console.error('Error processing image:', err)
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
            <p className="text-sm">Subiendo... {progress}%</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium">Haz clic para subir</p>
            <p className="text-xs">o arrastra una imagen desde tu galería</p>
            <p className="text-[10px] opacity-70">Se comprime y sube automáticamente</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
