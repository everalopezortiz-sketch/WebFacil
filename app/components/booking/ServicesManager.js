'use client'
import React, { useState } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Scissors, Clock } from 'lucide-react'
import { toast } from 'sonner'

export default function ServicesManager({ supabase, services = [], categories = [], onReload }) {
  const [dialog, setDialog] = useState({ open: false, data: null })
  const [saving, setSaving] = useState(false)

  const blank = { name: '', description: '', category_id: 'none', price: '', promo_price: '', promo_active: false, duration_minutes: 30, buffer_before_minutes: 0, buffer_after_minutes: 0, color: '#7c3aed', is_active: true }
  const open = (s) => setDialog({ open: true, data: s ? { ...s, category_id: s.category_id || 'none' } : { ...blank } })

  const save = async () => {
    const d = { ...dialog.data }
    if (!d.name?.trim()) { toast.error('Ingresa un nombre'); return }
    d.price = parseFloat(d.price) || 0
    d.promo_price = d.promo_price === '' ? null : parseFloat(d.promo_price)
    d.duration_minutes = parseInt(d.duration_minutes) || 30
    d.buffer_before_minutes = parseInt(d.buffer_before_minutes) || 0
    d.buffer_after_minutes = parseInt(d.buffer_after_minutes) || 0
    setSaving(true)
    const isEdit = !!d.id
    const res = await authFetch(supabase, isEdit ? `/api/booking/services/${d.id}` : '/api/booking/services', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(d) })
    setSaving(false)
    if (res.ok) { toast.success('Servicio guardado'); setDialog({ open: false, data: null }); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar este servicio? Si ya fue usado en reservas, se desactivará para conservar el historial.')) return
    const res = await authFetch(supabase, `/api/booking/services/${id}`, { method: 'DELETE' })
    if (res.ok) { const r = await res.json(); toast.success(r.softDeleted ? 'Servicio desactivado (tenía historial)' : 'Servicio eliminado'); onReload?.() }
    else toast.error('No se pudo eliminar')
  }

  const catName = (id) => categories.find(c => c.id === id)?.name

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Servicios</h3>
          <p className="text-sm text-muted-foreground">Ej: Corte, Corte + barba, Coloración, Manicura</p>
        </div>
        <Button onClick={() => open(null)} className="gap-2"><Plus className="w-4 h-4" />Nuevo</Button>
      </div>
      {services.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Scissors className="w-8 h-8 mx-auto mb-2 opacity-50" />Aún no hay servicios cargados.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-3 h-10 rounded-full flex-shrink-0" style={{ background: s.color || '#7c3aed' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><p className="font-medium">{s.name}</p>{!s.is_active && <Badge variant="secondary">Inactivo</Badge>}{catName(s.category_id) && <Badge variant="outline">{catName(s.category_id)}</Badge>}</div>
                    <p className="text-sm text-muted-foreground flex items-center gap-3 mt-1"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_minutes} min</span><span className="font-semibold text-foreground">{s.promo_active && s.promo_price != null ? <><span className="line-through text-muted-foreground mr-1">{s.price}</span>{s.promo_price}</> : s.price}</span></p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => open(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => del(s.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, data: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.data?.id ? 'Editar' : 'Nuevo'} servicio</DialogTitle></DialogHeader>
          {dialog.data && (
            <div className="space-y-4">
              <div><Label>Nombre</Label><Input value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} placeholder="Corte de cabello" /></div>
              <div><Label>Categoría</Label>
                <Select value={dialog.data.category_id} onValueChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, category_id: v } })}>
                  <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Sin categoría</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Descripción</Label><Textarea value={dialog.data.description || ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, description: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Precio</Label><Input type="number" value={dialog.data.price} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, price: e.target.value } })} /></div>
                <div><Label>Duración (min)</Label><Input type="number" value={dialog.data.duration_minutes} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, duration_minutes: e.target.value } })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div><Label>Precio promocional</Label><p className="text-xs text-muted-foreground">Activar oferta</p></div>
                <Switch checked={dialog.data.promo_active} onCheckedChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, promo_active: v } })} />
              </div>
              {dialog.data.promo_active && <div><Label>Precio en oferta</Label><Input type="number" value={dialog.data.promo_price ?? ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, promo_price: e.target.value } })} /></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preparación previa (min)</Label><Input type="number" value={dialog.data.buffer_before_minutes} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, buffer_before_minutes: e.target.value } })} /></div>
                <div><Label>Limpieza posterior (min)</Label><Input type="number" value={dialog.data.buffer_after_minutes} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, buffer_after_minutes: e.target.value } })} /></div>
              </div>
              <div><Label>Color en la agenda</Label><Input type="color" value={dialog.data.color || '#7c3aed'} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, color: e.target.value } })} className="h-10 w-20 p-1" /></div>
              <div className="flex items-center justify-between rounded-md border p-3"><Label>Activo (visible en la web)</Label><Switch checked={dialog.data.is_active} onCheckedChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, is_active: v } })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, data: null })}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
