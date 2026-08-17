'use client'
import React, { useState } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'

export default function StaffManager({ supabase, staff = [], services = [], staffServices = [], onReload }) {
  const [dialog, setDialog] = useState({ open: false, data: null, serviceIds: [] })
  const [saving, setSaving] = useState(false)

  const blank = { name: '', description: '', phone: '', email: '', photo_url: '', color: '#7c3aed', is_active: true }
  const open = (s) => {
    const ids = s ? staffServices.filter(ss => ss.staff_id === s.id).map(ss => ss.service_id) : []
    setDialog({ open: true, data: s ? { ...s } : { ...blank }, serviceIds: ids })
  }

  const toggleService = (id) => {
    setDialog(d => ({ ...d, serviceIds: d.serviceIds.includes(id) ? d.serviceIds.filter(x => x !== id) : [...d.serviceIds, id] }))
  }

  const save = async () => {
    const d = { ...dialog.data, service_ids: dialog.serviceIds }
    if (!d.name?.trim()) { toast.error('Ingresa un nombre'); return }
    setSaving(true)
    const isEdit = !!d.id
    const res = await authFetch(supabase, isEdit ? `/api/booking/staff/${d.id}` : '/api/booking/staff', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(d) })
    setSaving(false)
    if (res.ok) { toast.success('Profesional guardado'); setDialog({ open: false, data: null, serviceIds: [] }); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar este profesional? Si tiene citas, se desactivará.')) return
    const res = await authFetch(supabase, `/api/booking/staff/${id}`, { method: 'DELETE' })
    if (res.ok) { const r = await res.json(); toast.success(r.softDeleted ? 'Profesional desactivado (tenía citas)' : 'Profesional eliminado'); onReload?.() }
    else toast.error('No se pudo eliminar')
  }

  const svcCount = (id) => staffServices.filter(ss => ss.staff_id === id).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Profesionales</h3>
          <p className="text-sm text-muted-foreground">Asigna a cada profesional los servicios que realiza</p>
        </div>
        <Button onClick={() => open(null)} className="gap-2"><Plus className="w-4 h-4" />Nuevo</Button>
      </div>
      {staff.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><UserRound className="w-8 h-8 mx-auto mb-2 opacity-50" />Aún no hay profesionales.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-10 h-10 rounded-full object-cover" /> : <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: s.color || '#7c3aed' }}>{s.name?.[0]?.toUpperCase()}</span>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><p className="font-medium truncate">{s.name}</p>{!s.is_active && <Badge variant="secondary">Inactivo</Badge>}</div>
                    <p className="text-xs text-muted-foreground">{svcCount(s.id)} servicio(s)</p>
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

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, data: null, serviceIds: [] })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.data?.id ? 'Editar' : 'Nuevo'} profesional</DialogTitle></DialogHeader>
          {dialog.data && (
            <div className="space-y-4">
              <div><Label>Nombre</Label><Input value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Teléfono</Label><Input value={dialog.data.phone || ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} /></div>
                <div><Label>Email</Label><Input value={dialog.data.email || ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, email: e.target.value } })} /></div>
              </div>
              <div><Label>Foto (URL)</Label><Input value={dialog.data.photo_url || ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, photo_url: e.target.value } })} placeholder="https://..." /></div>
              <div><Label>Color</Label><Input type="color" value={dialog.data.color || '#7c3aed'} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, color: e.target.value } })} className="h-10 w-20 p-1" /></div>
              <div>
                <Label>Servicios que realiza</Label>
                {services.length === 0 ? <p className="text-sm text-muted-foreground mt-1">Crea servicios primero.</p> : (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                    {services.map(sv => (
                      <label key={sv.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                        <Checkbox checked={dialog.serviceIds.includes(sv.id)} onCheckedChange={() => toggleService(sv.id)} />
                        {sv.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-md border p-3"><Label>Activo</Label><Switch checked={dialog.data.is_active} onCheckedChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, is_active: v } })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, data: null, serviceIds: [] })}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
