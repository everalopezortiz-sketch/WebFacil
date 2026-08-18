'use client'

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser } from 'lucide-react'

// Canvas signature pad. Exposes getBlob() (trimmed + resized WebP, ~20-60KB)
// and clear(). isEmpty() reports whether anything was drawn.
const SignaturePad = forwardRef(function SignaturePad({ label }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX - rect.left, y: t.clientY - rect.top }
  }
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e) }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; dirty.current = true; if (!hasInk) setHasInk(true)
  }
  const end = () => { drawing.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false; setHasInk(false)
  }

  const getBlob = async () => {
    if (!dirty.current) return null
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const data = ctx.getImageData(0, 0, width, height).data
    // find bounding box of non-transparent pixels
    let minX = width, minY = height, maxX = 0, maxY = 0, found = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          found = true
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    if (!found) return null
    const pad = 8
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
    maxX = Math.min(width, maxX + pad); maxY = Math.min(height, maxY + pad)
    const cw = maxX - minX, ch = maxY - minY
    // target max width 600px keeping aspect
    const scale = Math.min(1, 600 / cw)
    const out = document.createElement('canvas')
    out.width = Math.round(cw * scale); out.height = Math.round(ch * scale)
    const octx = out.getContext('2d')
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, out.width, out.height)
    let blob = await new Promise(res => out.toBlob(res, 'image/webp', 0.85))
    if (blob && blob.size > 128 * 1024) blob = await new Promise(res => out.toBlob(res, 'image/webp', 0.6))
    return blob
  }

  useImperativeHandle(ref, () => ({ getBlob, clear, isEmpty: () => !dirty.current }))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} className="h-7 text-xs gap-1"><Eraser className="w-3 h-3" /> Limpiar</Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-36 rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      {!hasInk && <p className="text-xs text-muted-foreground mt-1">Firmá con el dedo o el mouse</p>}
    </div>
  )
})

export default SignaturePad
