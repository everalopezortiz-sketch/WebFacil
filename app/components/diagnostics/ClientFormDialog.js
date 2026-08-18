'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { authFetch } from '@/lib/diagnostics/helpers'
import { toast } from 'sonner'

const EMPTY = { full_name: '', phone: '', document: '', email: '', birth_date: '', gender: '', address: '', city: '', occupation: '', general_notes: '' }

export default function ClientFormDialog({ supabase, open, onOpenChange, client, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(client ? { ...EMPTY, ...Object.fromEntries(Object.entries(client).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) } : EMPTY)
  }, [open, client])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.full_name.trim()) { toast.error('Ingresá el nombre del cliente'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
      const url = client ? `/api/diagnostics/clients/${client.id}` : '/api/diagnostics/clients'
      const res = await authFetch(supabase, url, { method: client ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success(client ? 'Cliente actualizado' : 'Cliente creado')
      onSaved && onSaved(data)
      onOpenChange(false)
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{client ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>Nombre y apellido *</Label><Input value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Teléfono</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="space-y-1"><Label>Documento</Label><Input value={form.document} onChange={e => set('document', e.target.value)} /></div>
          <div className="space-y-1"><Label>Fecha de nacimiento</Label><Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} /></div>
          <div className="space-y-1"><Label>Género</Label>
            <Select value={form.gender || ''} onValueChange={v => set('gender', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="femenino">Femenino</SelectItem>
                <SelectItem value="masculino">Masculino</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="space-y-1"><Label>Ocupación</Label><Input value={form.occupation} onChange={e => set('occupation', e.target.value)} /></div>
          <div className="space-y-1"><Label>Ciudad</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Dirección</Label><Input value={form.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>Notas generales</Label><Textarea rows={2} value={form.general_notes} onChange={e => set('general_notes', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
