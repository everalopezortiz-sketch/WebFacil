'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'
import { authFetch } from '@/lib/diagnostics/helpers'
import { toast } from 'sonner'

export default function DiagnosticSettings({ supabase, settings, onSaved }) {
  const [form, setForm] = useState({ pdf_title: '', pdf_primary_color: '#8b5cf6', pdf_footer: '', default_share_expiry_days: 7 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm({
      pdf_title: settings.pdf_title || 'Ficha Técnica de Diagnóstico Capilar',
      pdf_primary_color: settings.pdf_primary_color || '#8b5cf6',
      pdf_footer: settings.pdf_footer || '',
      default_share_expiry_days: settings.default_share_expiry_days || 7,
    })
  }, [settings])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => {
    setSaving(true)
    try {
      const res = await authFetch(supabase, '/api/diagnostics/settings', { method: 'PUT', body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success('Configuración guardada')
      onSaved && onSaved(data)
    } finally { setSaving(false) }
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="p-5 space-y-4">
        <h3 className="font-semibold text-lg">Configuración de fichas</h3>
        <div className="space-y-1"><Label>Título del PDF</Label><Input value={form.pdf_title} onChange={e => set('pdf_title', e.target.value)} /></div>
        <div className="space-y-1"><Label>Color principal</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.pdf_primary_color} onChange={e => set('pdf_primary_color', e.target.value)} className="w-12 h-10 rounded border cursor-pointer" />
            <Input value={form.pdf_primary_color} onChange={e => set('pdf_primary_color', e.target.value)} className="w-32" />
          </div>
        </div>
        <div className="space-y-1"><Label>Pie de página</Label><Input value={form.pdf_footer} onChange={e => set('pdf_footer', e.target.value)} /></div>
        <div className="space-y-1"><Label>Vencimiento por defecto de enlaces (días, máx 90)</Label><Input type="number" min={1} max={90} value={form.default_share_expiry_days} onChange={e => set('default_share_expiry_days', e.target.value)} /></div>
        <Button onClick={save} disabled={saving} className="gradient-brand text-white gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</Button>
      </CardContent>
    </Card>
  )
}
