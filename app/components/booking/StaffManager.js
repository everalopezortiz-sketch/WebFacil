'use client'
import React, { useState, useMemo } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'

const NO_CAT = '__none__'

export default function StaffManager({ supabase, staff = [], services = [], staffServices = [], categories = [], onReload }) {
  const [dialog, setDialog] = useState({ open: false, data: null, serviceIds: [] })
  const [saving, setSaving] = useState(false)
  const [catSel, setCatSel] = useState('')      // selected category in the picker
  const [svcSel, setSvcSel] = useState('')      // selected service in the picker

  const blank = { name: '', description: '', phone: '', email: '', photo_url: '', color: '#7c3aed', is_active: true }

  // Active services only, grouped by category (services with no/inactive category -> "Sin categoría")
  const activeCategories = useMemo(() => (categories || []).filter(c => c.is_active !== false), [categories])
  const activeServices = useMemo(() => (services || []).filter(s => s.is_active !== false), [services])
  const catIdSet = useMemo(() => new Set(activeCategories.map(c => c.id)), [activeCategories])

  // Categories that actually have at least one active service (plus "Sin categoría" bucket)
  const pickerCategories = useMemo(() => {
    const out = activeCategories.filter(c => activeServices.some(s => s.category_id === c.id))
    if (activeServices.some(s => !s.category_id || !catIdSet.has(s.category_id))) {
      out.push({ id: NO_CAT, name: 'Sin categoría' })
    }
    return out
  }, [activeCategories, activeServices, catIdSet])

  const servicesOfCat = (catId) => {
    if (catId === NO_CAT) return activeServices.filter(s => !s.category_id || !catIdSet.has(s.category_id))
    return activeServices.filter(s => s.category_id === catId)
  }

  const serviceInfo = (id) => services.find(s => s.id === id)
  const catNameOf = (svc) => {
    if (!svc) return 'Sin categoría'
    const c = activeCategories.find(x => x.id === svc.category_id)
    return c ? c.name : 'Sin categoría'
  }

  const open = (s) => {
    const ids = s ? staffServices.filter(ss => ss.staff_id === s.id).map(ss => ss.service_id) : []
    setDialog({ open: true, data: s ? { ...s } : { ...blank }, serviceIds: ids })
    setCatSel(''); setSvcSel('')
  }
  const closeDialog = () => { setDialog({ open: false, data: null, serviceIds: [] }); setCatSel(''); setSvcSel('') }

  const addService = () => {
    if (!svcSel) { toast.error('Elegí un servicio'); return }
    setDialog(d => d.serviceIds.includes(svcSel) ? d : { ...d, serviceIds: [...d.serviceIds, svcSel] })
    setSvcSel('')
  }
  const removeService = (id) => setDialog(d => ({ ...d, serviceIds: d.serviceIds.filter(x => x !== id) }))

  const save = async () => {
    const d = { ...dialog.data, service_ids: dialog.serviceIds }
    if (!d.name?.trim()) { toast.error('Ingresa un nombre'); return }
    setSaving(true)
    const isEdit = !!d.id
    const res = await authFetch(supabase, isEdit ? `/api/booking/staff/${d.id}` : '/api/booking/staff', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(d) })
    setSaving(false)
    if (res.ok) { toast.success('Profesional guardado'); closeDialog(); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar este profesional? Si tiene citas, se desactivará.')) return
    const res = await authFetch(supabase, `/api/booking/staff/${id}`, { method: 'DELETE' })
    if (res.ok) { const r = await res.json(); toast.success(r.softDeleted ? 'Profesional desactivado (tenía citas)' : 'Profesional eliminado'); onReload?.() }
    else toast.error('No se pudo eliminar')
  }

  const svcCount = (id) => staffServices.filter(ss => ss.staff_id === id).length
  const availableInCat = servicesOfCat(catSel).filter(s => !dialog.serviceIds.includes(s.id))

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

      <Dialog open={dialog.open} onOpenChange={(o) => !o && closeDialog()}>
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

              {/* Service assignment by category */}
              <div className="space-y-2 rounded-md border p-3">
                <Label>Servicios que realiza</Label>
                {activeServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Creá servicios primero.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">Categoría</Label>
                        <Select value={catSel} onValueChange={(v) => { setCatSel(v); setSvcSel('') }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Elegí categoría" /></SelectTrigger>
                          <SelectContent>{pickerCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Servicio</Label>
                        <Select value={svcSel} onValueChange={setSvcSel} disabled={!catSel}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={catSel ? 'Elegí servicio' : 'Elegí categoría'} /></SelectTrigger>
                          <SelectContent>
                            {availableInCat.length === 0
                              ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Sin servicios disponibles</div>
                              : availableInCat.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" onClick={addService} disabled={!svcSel} className="h-9 gap-1"><Plus className="w-4 h-4" />Agregar</Button>
                    </div>
                    {catSel && servicesOfCat(catSel).length === 0 && (
                      <p className="text-xs text-muted-foreground">Esta categoría no tiene servicios activos.</p>
                    )}

                    <div className="mt-1">
                      <p className="text-xs text-muted-foreground mb-1">Servicios asignados ({dialog.serviceIds.length})</p>
                      {dialog.serviceIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todavía no asignaste servicios.</p>
                      ) : (
                        <div className="space-y-1">
                          {dialog.serviceIds.map(id => {
                            const svc = serviceInfo(id)
                            return (
                              <div key={id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                                <span className="min-w-0 truncate"><span className="text-muted-foreground">{catNameOf(svc)} → </span><span className="font-medium">{svc?.name || 'Servicio'}</span></span>
                                <button type="button" onClick={() => removeService(id)} className="text-red-500 hover:text-red-600 flex-shrink-0"><X className="w-4 h-4" /></button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border p-3"><Label>Activo</Label><Switch checked={dialog.data.is_active} onCheckedChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, is_active: v } })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
