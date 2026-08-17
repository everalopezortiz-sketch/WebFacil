'use client'
import React, { useState } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'

export default function ServiceCategoriesManager({ supabase, categories = [], onReload }) {
  const [dialog, setDialog] = useState({ open: false, data: null })
  const [saving, setSaving] = useState(false)

  const open = (c) => setDialog({ open: true, data: c ? { ...c } : { name: '', description: '', color: '#7c3aed', is_active: true } })

  const save = async () => {
    const d = dialog.data
    if (!d.name?.trim()) { toast.error('Ingresa un nombre'); return }
    setSaving(true)
    const isEdit = !!d.id
    const res = await authFetch(supabase, isEdit ? `/api/booking/service-categories/${d.id}` : '/api/booking/service-categories', {
      method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(d)
    })
    setSaving(false)
    if (res.ok) { toast.success('Categoría guardada'); setDialog({ open: false, data: null }); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar esta categoría de servicios?')) return
    const res = await authFetch(supabase, `/api/booking/service-categories/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Categoría eliminada'); onReload?.() }
    else toast.error('No se pudo eliminar')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Categorías de servicios</h3>
          <p className="text-sm text-muted-foreground">Ej: Peluquería, Barbería, Uñas, Estética</p>
        </div>
        <Button onClick={() => open(null)} className="gap-2"><Plus className="w-4 h-4" />Nueva</Button>
      </div>
      {categories.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />Aún no hay categorías de servicios.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: c.color || '#7c3aed' }} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                  </div>
                  {!c.is_active && <Badge variant="secondary">Inactiva</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => open(c)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => del(c.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, data: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog.data?.id ? 'Editar' : 'Nueva'} categoría</DialogTitle></DialogHeader>
          {dialog.data && (
            <div className="space-y-4">
              <div><Label>Nombre</Label><Input value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} placeholder="Peluquería" /></div>
              <div><Label>Descripción</Label><Textarea value={dialog.data.description || ''} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, description: e.target.value } })} /></div>
              <div><Label>Color</Label><Input type="color" value={dialog.data.color || '#7c3aed'} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, color: e.target.value } })} className="h-10 w-20 p-1" /></div>
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
