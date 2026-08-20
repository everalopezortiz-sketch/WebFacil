'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CalendarClock, Plus, History, Loader2, DollarSign, CheckCircle2, XCircle, UserX, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'

const PM_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mixed: 'Mixto', other: 'Otro' }
const PM_KEYS = ['cash', 'transfer', 'card', 'mixed', 'other']
const fmtDT = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return iso } }
const fmtD = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso } }

export default function ServiceCheckoutManager({ supabase, profile, active = true, currencySymbol = 'Gs' }) {
  const [tab, setTab] = useState('pendientes')
  const [loaded, setLoaded] = useState(false)
  const [base, setBase] = useState({ staff: [], services: [], staffServices: [] })
  const money = (v) => `${currencySymbol} ${Math.round(Number(v || 0)).toLocaleString('es-PY')}`

  const loadBase = useCallback(async () => {
    const get = async (url) => { const r = await authFetch(supabase, url); return r.ok ? r.json() : [] }
    const [staff, services, staffServices] = await Promise.all([
      get('/api/booking/staff'), get('/api/booking/services'), get('/api/booking/staff-services'),
    ])
    setBase({ staff, services, staffServices })
    setLoaded(true)
  }, [supabase])
  useEffect(() => { if (active && !loaded) loadBase() }, [active, loaded, loadBase])

  const helpers = useMemo(() => {
    const activeStaff = base.staff.filter(s => s.is_active !== false)
    const staffForService = (sid) => activeStaff.filter(st => base.staffServices.some(ss => ss.staff_id === st.id && ss.service_id === sid))
    const assignedPct = (staffId, serviceId) => {
      const ss = base.staffServices.find(x => x.staff_id === staffId && x.service_id === serviceId)
      if (ss && ss.commission_percent != null) return Number(ss.commission_percent)
      const st = base.staff.find(x => x.id === staffId)
      return st?.default_commission_percent != null ? Number(st.default_commission_percent) : 0
    }
    return { activeStaff, staffForService, assignedPct }
  }, [base])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Cobros de servicios</h2>
        <p className="text-sm text-muted-foreground">Finalizá y cobrá citas, registrá servicios y revisá el historial.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-white/60 backdrop-blur p-1.5 shadow-sm overflow-x-auto">
          <TabsTrigger value="pendientes" className="gap-2"><CalendarClock className="w-4 h-4" />Pendientes de Agenda</TabsTrigger>
          <TabsTrigger value="registrar" className="gap-2"><Plus className="w-4 h-4" />Registrar servicio</TabsTrigger>
          <TabsTrigger value="historial" className="gap-2"><History className="w-4 h-4" />Historial de cobros</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          {!loaded ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando...</div>
          ) : (
            <>
              <TabsContent value="pendientes"><PendingTab supabase={supabase} helpers={helpers} money={money} /></TabsContent>
              <TabsContent value="registrar"><ManualTab supabase={supabase} base={base} helpers={helpers} money={money} /></TabsContent>
              <TabsContent value="historial"><HistoryTab supabase={supabase} staff={base.staff} money={money} /></TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}

// ---------------- PENDING ----------------
function PendingTab({ supabase, helpers, money }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { card, markPaid }

  const load = useCallback(async () => {
    setLoading(true)
    const r = await authFetch(supabase, '/api/booking/checkouts/pending?limit=50&offset=0')
    const d = r.ok ? await r.json() : { items: [] }
    setItems(d.items || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const setStatus = async (card, status) => {
    const label = status === 'no_show' ? 'marcar como No asistió' : 'cancelar'
    if (!confirm(`¿Seguro que querés ${label} esta cita?`)) return
    const res = await authFetch(supabase, '/api/booking/appointments/status', { method: 'PUT', body: JSON.stringify({ appointment_id: card.appointmentId, status }) })
    if (res.ok) { toast.success('Cita actualizada'); setItems(prev => prev.filter(c => c.appointmentId !== card.appointmentId)) }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'No se pudo actualizar') }
  }

  const onDone = (appointmentId) => { setItems(prev => prev.filter(c => c.appointmentId !== appointmentId)); setModal(null) }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Actualizar</Button></div>
      {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No hay citas pendientes de cobro.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(card => (
            <Card key={card.appointmentId} className="flex flex-col">
              <CardContent className="p-4 space-y-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{card.customerName || 'Cliente'}</span>
                  <Badge variant="outline" className="text-amber-700 border-amber-300 whitespace-nowrap">Pendiente</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{fmtDT(card.startAt)} · {card.staffName}</p>
                <div className="text-sm">{(card.services || []).map(s => s.serviceName).join(', ')}</div>
                <p className="font-bold text-primary">{money(card.totalPrice)}</p>
              </CardContent>
              <div className="p-3 pt-0 space-y-2">
                <Button className="w-full gap-2" onClick={() => setModal({ card, markPaid: true })}><DollarSign className="w-4 h-4" />Cobrar y finalizar</Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => setModal({ card, markPaid: false })}><CheckCircle2 className="w-4 h-4" />Finalizar sin cobrar</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 gap-1 text-muted-foreground" onClick={() => setStatus(card, 'no_show')}><UserX className="w-4 h-4" />No asistió</Button>
                  <Button variant="ghost" size="sm" className="flex-1 gap-1 text-red-500" onClick={() => setStatus(card, 'cancelled')}><XCircle className="w-4 h-4" />Cancelar</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {modal && <CheckoutModal supabase={supabase} helpers={helpers} money={money} card={modal.card} markPaid={modal.markPaid} onClose={() => setModal(null)} onDone={onDone} />}
    </div>
  )
}

// Modal to finalize/charge a booking appointment
function CheckoutModal({ supabase, helpers, money, card, markPaid, onClose, onDone }) {
  const [lines, setLines] = useState(() => (card.services || []).map(s => ({
    service_id: s.serviceId, appointment_service_id: s.appointmentServiceId, service_name: s.serviceName,
    staff_id: card.staffId, quantity: 1, unit_price: Number(s.price || 0), discount_amount: 0,
  })))
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const calc = (l) => { const net = Math.max(0, (Number(l.unit_price) || 0) * (l.quantity || 1) - (Number(l.discount_amount) || 0)); const pct = helpers.assignedPct(l.staff_id, l.service_id); return { net, pct, comm: Math.round(net * pct / 100) } }
  const subtotal = lines.reduce((s, l) => s + (Number(l.unit_price) || 0) * (l.quantity || 1), 0)
  const discountTotal = lines.reduce((s, l) => s + (Number(l.discount_amount) || 0), 0)
  const total = Math.max(0, subtotal - discountTotal)

  const submit = async () => {
    if (savingRef.current) return
    if (lines.some(l => !l.staff_id)) { toast.error('Seleccioná el profesional en cada servicio'); return }
    savingRef.current = true; setSaving(true)
    try {
      const body = {
        appointment_id: card.appointmentId, customer_name: card.customerName, customer_phone: card.customerPhone,
        mark_paid: markPaid, payment_method: markPaid ? paymentMethod : null, notes: notes || null,
        completed_at: new Date().toISOString(),
        items: lines.map(l => ({ service_id: l.service_id, appointment_service_id: l.appointment_service_id, staff_id: l.staff_id, quantity: l.quantity || 1, unit_price: Number(l.unit_price) || 0, discount_amount: Number(l.discount_amount) || 0 })),
      }
      const res = await authFetch(supabase, '/api/booking/service-sales', { method: 'POST', body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo registrar'); savingRef.current = false; setSaving(false); return }
      toast.success(d.alreadyExisted ? 'Esta cita ya estaba registrada' : (markPaid ? 'Cobro registrado' : 'Servicio finalizado (pendiente de cobro)'))
      onDone(card.appointmentId)
    } catch { toast.error('Error al registrar'); savingRef.current = false; setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{markPaid ? 'Cobrar y finalizar' : 'Finalizar sin cobrar'} — {card.customerName || 'Cliente'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {lines.map((l, i) => {
            const staffOpts = helpers.staffForService(l.service_id)
            const c = calc(l)
            return (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <p className="font-medium text-sm">{l.service_name}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Profesional</Label>
                    <Select value={l.staff_id || ''} onValueChange={(v) => setLine(i, { staff_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Elegí" /></SelectTrigger>
                      <SelectContent>{staffOpts.length === 0 ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Sin personal asignado</div> : staffOpts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Precio</Label><Input type="number" min="0" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} className="h-9" /></div>
                    <div><Label className="text-xs">Descuento</Label><Input type="number" min="0" value={l.discount_amount} onChange={(e) => setLine(i, { discount_amount: e.target.value })} className="h-9" /></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Comisión: {c.pct}% → <span className="font-medium text-emerald-700">{money(c.comm)}</span></p>
              </div>
            )
          })}
          <div className="rounded-md border divide-y text-sm">
            <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Descuento</span><span>- {money(discountTotal)}</span></div>
            <div className="flex justify-between px-3 py-2 font-bold text-base"><span>Total</span><span>{money(total)}</span></div>
          </div>
          {markPaid && (
            <div>
              <Label className="text-xs">Forma de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PM_KEYS.map(k => <SelectItem key={k} value={k}>{PM_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">Observación</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{markPaid ? 'Cobrar y finalizar' : 'Finalizar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- MANUAL ----------------
function ManualTab({ supabase, base, helpers, money }) {
  const activeServices = base.services.filter(s => s.is_active !== false)
  const blankLine = () => ({ service_id: '', staff_id: '', quantity: 1, unit_price: '', discount_amount: 0 })
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [completedAt, setCompletedAt] = useState(() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) })
  const [payStatus, setPayStatus] = useState('paid')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([blankLine()])
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => {
    if (idx !== i) return l
    const next = { ...l, ...patch }
    if (patch.service_id) { const svc = activeServices.find(s => s.id === patch.service_id); if (svc && (l.unit_price === '' || l.unit_price === undefined)) next.unit_price = Number((svc.promo_active && svc.promo_price) ? svc.promo_price : svc.price || 0); next.staff_id = '' }
    return next
  }))
  const addLine = () => setLines(ls => [...ls, blankLine()])
  const removeLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)

  const calc = (l) => { const net = Math.max(0, (Number(l.unit_price) || 0) * (l.quantity || 1) - (Number(l.discount_amount) || 0)); const pct = l.staff_id && l.service_id ? helpers.assignedPct(l.staff_id, l.service_id) : 0; return { net, pct, comm: Math.round(net * pct / 100) } }
  const total = lines.reduce((s, l) => s + calc(l).net, 0)

  const reset = () => { setCustomerName(''); setCustomerPhone(''); setNotes(''); setLines([blankLine()]); setPayStatus('paid'); setPaymentMethod('cash') }

  const submit = async () => {
    if (savingRef.current) return
    const valid = lines.filter(l => l.service_id && l.staff_id)
    if (valid.length === 0) { toast.error('Agregá al menos un servicio con profesional'); return }
    if (valid.length !== lines.length) { toast.error('Completá servicio y profesional en cada línea'); return }
    const markPaid = payStatus === 'paid'
    savingRef.current = true; setSaving(true)
    try {
      const body = {
        customer_name: customerName || null, customer_phone: customerPhone || null,
        mark_paid: markPaid, payment_method: markPaid ? paymentMethod : null, notes: notes || null,
        completed_at: new Date(completedAt).toISOString(),
        items: lines.map(l => ({ service_id: l.service_id, staff_id: l.staff_id, quantity: l.quantity || 1, unit_price: Number(l.unit_price) || 0, discount_amount: Number(l.discount_amount) || 0 })),
      }
      const res = await authFetch(supabase, '/api/booking/service-sales', { method: 'POST', body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo registrar'); savingRef.current = false; setSaving(false); return }
      toast.success(markPaid ? 'Servicio cobrado' : 'Servicio registrado (pendiente de cobro)')
      reset()
    } catch { toast.error('Error al registrar') }
    savingRef.current = false; setSaving(false)
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Registrar servicio realizado</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Cliente (opcional)</Label><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
          <div><Label className="text-xs">Teléfono (opcional)</Label><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
          <div><Label className="text-xs">Fecha y hora</Label><Input type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} /></div>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => {
            const staffOpts = l.service_id ? helpers.staffForService(l.service_id) : []
            const c = calc(l)
            return (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">Servicio {i + 1}</span>{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Servicio</Label>
                    <Select value={l.service_id} onValueChange={(v) => setLine(i, { service_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Elegí servicio" /></SelectTrigger>
                      <SelectContent>{activeServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Profesional</Label>
                    <Select value={l.staff_id} onValueChange={(v) => setLine(i, { staff_id: v })} disabled={!l.service_id}>
                      <SelectTrigger className="h-9"><SelectValue placeholder={l.service_id ? 'Elegí' : 'Elegí servicio'} /></SelectTrigger>
                      <SelectContent>{staffOpts.length === 0 ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Sin personal asignado</div> : staffOpts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Cantidad</Label><Input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: parseInt(e.target.value) || 1 })} className="h-9" /></div>
                  <div><Label className="text-xs">Precio</Label><Input type="number" min="0" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} className="h-9" /></div>
                  <div><Label className="text-xs">Descuento</Label><Input type="number" min="0" value={l.discount_amount} onChange={(e) => setLine(i, { discount_amount: e.target.value })} className="h-9" /></div>
                </div>
                {l.staff_id && <p className="text-xs text-muted-foreground">Comisión: {c.pct}% → <span className="font-medium text-emerald-700">{money(c.comm)}</span></p>}
              </div>
            )
          })}
          <Button variant="outline" size="sm" className="gap-1" onClick={addLine}><Plus className="w-4 h-4" />Agregar servicio</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Estado de pago</Label>
            <Select value={payStatus} onValueChange={setPayStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="paid">Cobrado</SelectItem><SelectItem value="pending">Pendiente de cobro</SelectItem></SelectContent>
            </Select>
          </div>
          {payStatus === 'paid' && (
            <div>
              <Label className="text-xs">Forma de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PM_KEYS.map(k => <SelectItem key={k} value={k}>{PM_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div><Label className="text-xs">Observación</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        <div className="flex items-center justify-between sticky bottom-0 bg-card pt-2">
          <span className="font-bold text-lg">Total: {money(total)}</span>
          <Button onClick={submit} disabled={saving} className="gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Registrar servicio</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------- HISTORY ----------------
function HistoryTab({ supabase, staff, money }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({ from: '', to: '', staff_id: 'all', payment_status: 'all', search: '' })
  const [searchInput, setSearchInput] = useState('')
  const abortRef = useRef(null)
  const staffName = (id) => staff.find(s => s.id === id)?.name || ''

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController(); abortRef.current = ctrl
    const p = new URLSearchParams({ limit: '50', offset: String(off) })
    if (filters.from) p.set('from', filters.from)
    if (filters.to) p.set('to', filters.to)
    if (filters.staff_id !== 'all') p.set('staff_id', filters.staff_id)
    if (filters.payment_status !== 'all') p.set('payment_status', filters.payment_status)
    if (filters.search) p.set('search', filters.search)
    try {
      const r = await authFetch(supabase, `/api/booking/service-sales?${p}`, { signal: ctrl.signal })
      const d = r.ok ? await r.json() : { items: [] }
      setItems(d.items || []); setOffset(off)
    } catch (e) { if (e.name !== 'AbortError') toast.error('Error al cargar') }
    setLoading(false)
  }, [supabase, filters])
  useEffect(() => { load(0) }, [load])

  // debounce search
  useEffect(() => { const t = setTimeout(() => setFilters(f => ({ ...f, search: searchInput })), 400); return () => clearTimeout(t) }, [searchInput])

  const [payModal, setPayModal] = useState(null)
  const [paying, setPaying] = useState(false)
  const doPay = async (method) => {
    setPaying(true)
    const res = await authFetch(supabase, `/api/booking/service-sales/${payModal.id}/pay`, { method: 'PUT', body: JSON.stringify({ payment_method: method }) })
    const d = await res.json().catch(() => ({}))
    setPaying(false)
    if (!res.ok) { toast.error(d.error || 'No se pudo cobrar'); return }
    toast.success('Cobro registrado'); setPayModal(null); load(offset)
  }

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
        <div><Label className="text-xs">Desde</Label><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="h-9" /></div>
        <div><Label className="text-xs">Hasta</Label><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="h-9" /></div>
        <div>
          <Label className="text-xs">Personal</Label>
          <Select value={filters.staff_id} onValueChange={(v) => setFilters({ ...filters, staff_id: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={filters.payment_status} onValueChange={(v) => setFilters({ ...filters, payment_status: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="paid">Pagado</SelectItem><SelectItem value="pending">Pendiente</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="col-span-2 lg:col-span-2"><Label className="text-xs">Buscar</Label><div className="relative"><Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" /><Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cliente o N° SRV" className="h-9 pl-8" /></div></div>
      </CardContent></Card>

      {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin cobros registrados.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">N°</th><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Cliente</th><th className="py-2 px-3">Servicios / Personal</th><th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {items.map(s => {
                const svcNames = (s.booking_service_sale_items || []).map(it => it.service_name_snapshot).join(', ')
                const staffNames = [...new Set((s.booking_service_sale_items || []).map(it => it.staff_name_snapshot).filter(Boolean))].join(', ')
                return (
                  <tr key={s.id} className="border-b last:border-0 align-top">
                    <td className="py-2 px-3 font-medium whitespace-nowrap">{s.sale_number}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDT(s.completed_at)}</td>
                    <td className="py-2 px-3">{s.customer_name || '-'}</td>
                    <td className="py-2 px-3"><div>{svcNames}</div><div className="text-xs text-muted-foreground">{staffNames}</div></td>
                    <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{money(s.total_amount)}</td>
                    <td className="py-2 px-3">{s.payment_status === 'paid' ? <Badge className="bg-green-100 text-green-800 border-green-300">Pagado{s.payment_method ? ` · ${PM_LABELS[s.payment_method] || ''}` : ''}</Badge> : <Badge variant="outline" className="text-amber-700 border-amber-300">Pendiente</Badge>}</td>
                    <td className="py-2 px-3">{s.payment_status !== 'paid' && <Button size="sm" onClick={() => setPayModal(s)}>Cobrar</Button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}

      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => load(Math.max(0, offset - 50))}>Anteriores</Button>
        <span className="text-xs text-muted-foreground">Mostrando {items.length} · desde {offset + 1}</span>
        <Button variant="outline" size="sm" disabled={items.length < 50 || loading} onClick={() => load(offset + 50)}>Siguientes</Button>
      </div>

      <Dialog open={!!payModal} onOpenChange={(o) => !o && setPayModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cobrar {payModal?.sale_number}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{money(payModal?.total_amount)}</span></p>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {PM_KEYS.map(k => <Button key={k} variant="outline" disabled={paying} onClick={() => doPay(k)}>{PM_LABELS[k]}</Button>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
