'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { authFetch, STATUS_META, fmtTime } from '@/lib/booking/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Phone, MessageCircle, Check, X, CalendarClock, UserX, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

export default function AppointmentDialog({ supabase, open, onClose, mode, initial, appointment, staff = [], services = [], staffServices = [], onChanged }) {
  const [form, setForm] = useState({})
  const [serviceIds, setServiceIds] = useState([])
  const [busy, setBusy] = useState(false)
  const [reschedule, setReschedule] = useState(null)

  useEffect(() => {
    if (open && mode === 'create') {
      setForm({ staff_id: initial?.staffId || staff.find(s => s.is_active)?.id || '', date: initial?.date || '', time: initial?.time || '09:00', customerName: '', customerPhone: '', customerEmail: '', customerNotes: '' })
      setServiceIds([])
    }
    if (open && mode === 'view') { setReschedule(null) }
  }, [open, mode, initial])

  // Only services the selected staff can perform
  const allowedServices = useMemo(() => {
    if (!form.staff_id) return services.filter(s => s.is_active)
    const ids = staffServices.filter(ss => ss.staff_id === form.staff_id).map(ss => ss.service_id)
    return services.filter(s => s.is_active && ids.includes(s.id))
  }, [form.staff_id, services, staffServices])

  const totals = useMemo(() => {
    const sel = services.filter(s => serviceIds.includes(s.id))
    const price = sel.reduce((a, s) => a + Number((s.promo_active && s.promo_price != null) ? s.promo_price : s.price || 0), 0)
    const dur = sel.reduce((a, s) => a + Number(s.duration_minutes || 0), 0)
    return { price, dur }
  }, [serviceIds, services])

  const toggle = (id) => setServiceIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const submitCreate = async () => {
    if (serviceIds.length === 0) { toast.error('Selecciona al menos un servicio'); return }
    if (!form.staff_id) { toast.error('Selecciona un profesional'); return }
    if (!form.date || !form.time) { toast.error('Selecciona fecha y hora'); return }
    if (!form.customerName?.trim()) { toast.error('Ingresa el nombre del cliente'); return }
    const start_at = `${form.date}T${form.time}:00`
    setBusy(true)
    const res = await authFetch(supabase, '/api/booking/appointments/manual', { method: 'POST', body: JSON.stringify({ staff_id: form.staff_id, service_ids: serviceIds, start_at, customer_name: form.customerName, customer_phone: form.customerPhone, customer_email: form.customerEmail, customer_notes: form.customerNotes }) })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { toast.success('Reserva creada'); onChanged?.(); onClose?.() }
    else toast.error(data.error || 'No se pudo crear la reserva')
  }

  const changeStatus = async (status, reason) => {
    setBusy(true)
    const res = await authFetch(supabase, '/api/booking/appointments/status', { method: 'PUT', body: JSON.stringify({ appointment_id: appointment.id, status, reason: reason || null }) })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { toast.success('Estado actualizado'); onChanged?.(); onClose?.() }
    else toast.error(data.error || 'No se pudo actualizar')
  }

  const submitReschedule = async () => {
    if (!reschedule.date || !reschedule.time) { toast.error('Selecciona nueva fecha y hora'); return }
    const start_at = `${reschedule.date}T${reschedule.time}:00`
    setBusy(true)
    const res = await authFetch(supabase, '/api/booking/appointments/reschedule', { method: 'PUT', body: JSON.stringify({ appointment_id: appointment.id, staff_id: reschedule.staff_id, start_at }) })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { toast.success('Reserva reprogramada'); onChanged?.(); onClose?.() }
    else toast.error(data.error || 'No se pudo reprogramar')
  }

  const staffName = (id) => staff.find(s => s.id === id)?.name || ''
  const waLink = (phone) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}`

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {mode === 'create' && (
          <>
            <DialogHeader><DialogTitle>Nueva reserva manual</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Profesional</Label>
                <Select value={form.staff_id} onValueChange={(v) => { setForm({ ...form, staff_id: v }); setServiceIds([]) }}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{staff.filter(s => s.is_active).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Servicios</Label>
                {allowedServices.length === 0 ? <p className="text-sm text-muted-foreground mt-1">Este profesional no tiene servicios asignados.</p> : (
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto rounded-md border p-2">
                    {allowedServices.map(sv => (
                      <label key={sv.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer py-1">
                        <span className="flex items-center gap-2"><Checkbox checked={serviceIds.includes(sv.id)} onCheckedChange={() => toggle(sv.id)} />{sv.name}</span>
                        <span className="text-muted-foreground">{sv.duration_minutes}min</span>
                      </label>
                    ))}
                  </div>
                )}
                {serviceIds.length > 0 && <p className="text-sm mt-2 font-medium">Total: {totals.dur} min · {totals.price}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fecha</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div><Label>Hora</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
              </div>
              <div><Label>Cliente</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Teléfono</Label><Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} /></div>
              </div>
              <div><Label>Notas</Label><Textarea value={form.customerNotes} onChange={(e) => setForm({ ...form, customerNotes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={submitCreate} disabled={busy}>{busy ? 'Guardando...' : 'Crear reserva'}</Button>
            </DialogFooter>
          </>
        )}
        {mode === 'view' && appointment && (
          <>
            <DialogHeader><DialogTitle className="flex items-center gap-2">{appointment.customer_name}<Badge className={STATUS_META[appointment.status]?.bg}>{STATUS_META[appointment.status]?.label}</Badge></DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">Horario:</span> {fmtTime(appointment.start_at)} - {fmtTime(appointment.end_at)}</p>
              <p><span className="text-muted-foreground">Profesional:</span> {staffName(appointment.staff_id)}</p>
              <div><span className="text-muted-foreground">Servicios:</span> <ul className="list-disc ml-5">{(appointment.appointment_services || []).sort((a,b)=>(a.display_order||0)-(b.display_order||0)).map((s, i) => <li key={i}>{s.service_name} — {s.price} ({s.duration_minutes}min)</li>)}</ul></div>
              <p className="font-semibold">Total: {appointment.total_price} · {appointment.total_duration_minutes} min</p>
              {appointment.customer_phone && <p><span className="text-muted-foreground">Teléfono:</span> {appointment.customer_phone}</p>}
              {appointment.customer_notes && <p><span className="text-muted-foreground">Notas cliente:</span> {appointment.customer_notes}</p>}
              {appointment.customer_phone && (
                <div className="flex gap-2">
                  <a href={`tel:${appointment.customer_phone}`}><Button size="sm" variant="outline" className="gap-1"><Phone className="w-4 h-4" />Llamar</Button></a>
                  <a href={waLink(appointment.customer_phone)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1"><MessageCircle className="w-4 h-4" />WhatsApp</Button></a>
                </div>
              )}
            </div>
            {reschedule ? (
              <div className="space-y-3 border-t pt-3 mt-2">
                <p className="font-medium">Reprogramar</p>
                <div><Label>Profesional</Label>
                  <Select value={reschedule.staff_id} onValueChange={(v) => setReschedule({ ...reschedule, staff_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{staff.filter(s => s.is_active).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Fecha</Label><Input type="date" value={reschedule.date} onChange={(e) => setReschedule({ ...reschedule, date: e.target.value })} /></div>
                  <div><Label>Hora</Label><Input type="time" value={reschedule.time} onChange={(e) => setReschedule({ ...reschedule, time: e.target.value })} /></div>
                </div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setReschedule(null)}>Cancelar</Button><Button onClick={submitReschedule} disabled={busy}>Confirmar</Button></div>
              </div>
            ) : (
              <DialogFooter className="flex-wrap gap-2">
                {appointment.status === 'pending' && <Button size="sm" onClick={() => changeStatus('confirmed')} disabled={busy} className="gap-1"><Check className="w-4 h-4" />Confirmar</Button>}
                {['pending','confirmed'].includes(appointment.status) && <Button size="sm" variant="outline" onClick={() => changeStatus('completed')} disabled={busy} className="gap-1"><CheckCheck className="w-4 h-4" />Completada</Button>}
                {['pending','confirmed'].includes(appointment.status) && <Button size="sm" variant="outline" onClick={() => changeStatus('no_show')} disabled={busy} className="gap-1"><UserX className="w-4 h-4" />No asistió</Button>}
                {['pending','confirmed'].includes(appointment.status) && <Button size="sm" variant="outline" onClick={() => setReschedule({ staff_id: appointment.staff_id, date: '', time: '' })} className="gap-1"><CalendarClock className="w-4 h-4" />Reprogramar</Button>}
                {['pending','confirmed'].includes(appointment.status) && <Button size="sm" variant="destructive" onClick={() => changeStatus('cancelled', 'Cancelada desde agenda')} disabled={busy} className="gap-1"><X className="w-4 h-4" />Cancelar</Button>}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
