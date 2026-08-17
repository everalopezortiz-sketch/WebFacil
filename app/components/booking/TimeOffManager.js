'use client'
import React, { useState } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, CalendarX } from 'lucide-react'
import { toast } from 'sonner'

export default function TimeOffManager({ supabase, staff = [], timeOff = [], onReload }) {
  const [dialog, setDialog] = useState({ open: false, data: null })
  const [saving, setSaving] = useState(false)

  const open = () => {
    const now = new Date(); const pad = (n) => String(n).padStart(2, '0')
    const d = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
    setDialog({ open: true, data: { staff_id: 'all', date: d, allDay: true, start: '09:00', end: '18:00', reason: '' } })
  }

  const save = async () => {
    const d = dialog.data
    const starts_at = d.allDay ? `${d.date}T00:00:00` : `${d.date}T${d.start}:00`
    const ends_at = d.allDay ? `${d.date}T23:59:59` : `${d.date}T${d.end}:00`
    setSaving(true)
    const res = await authFetch(supabase, '/api/booking/time-off', { method: 'POST', body: JSON.stringify({ staff_id: d.staff_id, starts_at, ends_at, reason: d.reason }) })
    setSaving(false)
    if (res.ok) { toast.success('Bloqueo creado'); setDialog({ open: false, data: null }); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    const res = await authFetch(supabase, `/api/booking/time-off/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bloqueo eliminado'); onReload?.() } else toast.error('Error al eliminar')
  }

  const staffName = (id) => id ? (staff.find(s => s.id === id)?.name || 'Profesional') : 'Todo el negocio'
  const fmt = (iso) => new Date(iso).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Bloqueos, feriados y vacaciones</h3>
          <p className="text-sm text-muted-foreground">Bloquea horas, días completos o a un profesional específico.</p>
        </div>
        <Button onClick={open} className="gap-2"><Plus className="w-4 h-4" />Nuevo bloqueo</Button>
      </div>
      {timeOff.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><CalendarX className="w-8 h-8 mx-auto mb-2 opacity-50" />No hay bloqueos registrados.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {timeOff.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><Badge variant={t.staff_id ? 'secondary' : 'default'}>{staffName(t.staff_id)}</Badge>{t.reason && <span className="text-sm font-medium">{t.reason}</span>}</div>
                  <p className="text-sm text-muted-foreground mt-1">{fmt(t.starts_at)} → {fmt(t.ends_at)}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => del(t.id)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, data: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo bloqueo</DialogTitle></DialogHeader>
          {dialog.data && (
            <div className="space-y-4">
              <div><Label>Aplica a</Label>
                <Select value={dialog.data.staff_id} onValueChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, staff_id: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todo el negocio</SelectItem>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Fecha</Label><Input type="date" value={dialog.data.date} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, date: e.target.value } })} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allday" checked={dialog.data.allDay} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, allDay: e.target.checked } })} />
                <Label htmlFor="allday">Día completo</Label>
              </div>
              {!dialog.data.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Desde</Label><Input type="time" value={dialog.data.start} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, start: e.target.value } })} /></div>
                  <div><Label>Hasta</Label><Input type="time" value={dialog.data.end} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, end: e.target.value } })} /></div>
                </div>
              )}
              <div><Label>Motivo</Label><Input value={dialog.data.reason} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, reason: e.target.value } })} placeholder="Feriado, vacaciones..." /></div>
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
