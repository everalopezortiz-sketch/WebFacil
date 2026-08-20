'use client'
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Clock, Check, ChevronLeft, CalendarDays, Scissors, User, MessageCircle, Loader2, PartyPopper, RefreshCw, Copy, X, Search, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'

// ---------- date / phone helpers ----------
function todayStr() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtSlot(iso) {
  try { return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '' }
}
function fmtLong(iso) {
  try { return new Date(iso).toLocaleString('es-PY', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}
const normPhone = (p) => (p || '').replace(/\D/g, '')

// ---------- on-device token storage (no personal data) ----------
const LS_KEY = (slug) => `webfacil:appointments:${slug}`
function loadTokens(slug) {
  try { const a = JSON.parse(localStorage.getItem(LS_KEY(slug)) || '[]'); return Array.isArray(a) ? a.filter(Boolean).slice(-10) : [] }
  catch { return [] }
}
function saveTokens(slug, tokens) { try { localStorage.setItem(LS_KEY(slug), JSON.stringify(tokens.slice(-10))) } catch { /* noop */ } }
function addToken(slug, token) { if (!token) return; const cur = loadTokens(slug); if (cur.includes(token)) return; saveTokens(slug, [...cur, token]) }
function removeToken(slug, token) { saveTokens(slug, loadTokens(slug).filter(t => t !== token)) }

const MY_STATUS = {
  pending: { label: 'Cita pendiente de confirmación', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Tenés una cita agendada', cls: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Cita completada', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Esta cita fue cancelada', cls: 'bg-red-100 text-red-700' },
  no_show: { label: 'No asististe a esta cita', cls: 'bg-gray-200 text-gray-700' },
}

const TTL = 10 * 60 * 1000

export default function StoreBooking({ slug, brandColor = '#7c3aed', formatPrice, businessPhone, autoOpen = false }) {
  const fp = formatPrice || ((n) => `${n}`)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // booking flow
  const [step, setStep] = useState('services')
  const [category, setCategory] = useState('')      // active category filter in the services step
  const [selected, setSelected] = useState([])       // selected service ids
  const [staffId, setStaffId] = useState('any')
  const [date, setDate] = useState(todayStr())
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [chosenSlot, setChosenSlot] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  // "Mis citas"
  const [myAppts, setMyAppts] = useState([])
  const [loadingMy, setLoadingMy] = useState(false)
  const [recover, setRecover] = useState({ open: false, code: '', phone: '', busy: false })
  const lastFetchRef = useRef(0)
  const slotAbort = useRef(null)

  useEffect(() => {
    fetch(`/api/store/${slug}/booking`).then(r => r.ok ? r.json() : null).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (autoOpen && data && !loading) {
      setOpen(true)
      try { document.getElementById('servicios')?.scrollIntoView({ behavior: 'smooth' }) } catch { /* noop */ }
    }
  }, [autoOpen, data, loading])

  const services = data?.services || []
  const categories = data?.serviceCategories || []
  const staff = data?.staff || []
  const staffServices = data?.staffServices || []
  const settings = data?.settings || {}

  // Categories that have at least one active service, plus a "Sin categoría" bucket
  const catIds = useMemo(() => new Set(categories.map(c => c.id)), [categories])
  const uncategorized = useMemo(() => services.filter(s => !s.category_id || !catIds.has(s.category_id)), [services, catIds])
  const pickerCats = useMemo(() => {
    const out = categories.filter(c => services.some(s => s.category_id === c.id)).map(c => ({ id: c.id, name: c.name }))
    if (uncategorized.length) out.push({ id: '__none__', name: 'Sin categoría' })
    return out
  }, [categories, services, uncategorized])

  useEffect(() => { if (!category && pickerCats.length) setCategory(pickerCats[0].id) }, [pickerCats, category])

  const servicesInCat = useCallback((catId) => catId === '__none__' ? uncategorized : services.filter(s => s.category_id === catId), [services, uncategorized])
  const serviceById = (id) => services.find(s => s.id === id)
  const catNameOf = (svc) => { if (!svc) return ''; const c = categories.find(x => x.id === svc.category_id); return c ? c.name : 'Sin categoría' }

  const totals = useMemo(() => {
    const sel = services.filter(s => selected.includes(s.id))
    const price = sel.reduce((a, s) => a + Number((s.promo_active && s.promo_price != null) ? s.promo_price : s.price || 0), 0)
    const dur = sel.reduce((a, s) => a + Number(s.duration_minutes || 0), 0)
    return { price, dur, sel }
  }, [selected, services])

  // Active staff that can perform ALL selected services
  const eligibleStaff = useMemo(() => {
    const act = staff.filter(s => s.is_active !== false)
    if (selected.length === 0) return act
    return act.filter(st => {
      const ids = staffServices.filter(ss => ss.staff_id === st.id).map(ss => ss.service_id)
      return selected.every(sid => ids.includes(sid))
    })
  }, [selected, staff, staffServices])

  const toggle = (id) => {
    if (!settings.allow_multiple_services) { setSelected([id]); return }
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    // changing services invalidates downstream selections
    setStaffId('any'); setChosenSlot(null)
  }

  // ---------- availability (with AbortController, never cached) ----------
  const loadSlots = useCallback(async () => {
    if (selected.length === 0) return
    slotAbort.current?.abort()
    const ctrl = new AbortController(); slotAbort.current = ctrl
    setLoadingSlots(true); setChosenSlot(null); setSlots([])
    try {
      const params = new URLSearchParams({ service_ids: selected.join(','), date })
      if (staffId !== 'any') params.set('staff_id', staffId)
      const res = await fetch(`/api/store/${slug}/booking/availability?${params}`, { signal: ctrl.signal, cache: 'no-store' })
      if (res.ok) {
        let d = await res.json()
        // With "any professional" keep a single time keeping one valid staff assignment
        if (staffId === 'any') { const seen = new Set(); d = d.filter(s => { if (seen.has(s.slot_start)) return false; seen.add(s.slot_start); return true }) }
        setSlots(d)
      } else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'No se pudieron cargar los horarios'); setSlots([]) }
    } catch (e) { if (e.name !== 'AbortError') setSlots([]) }
    finally { if (slotAbort.current === ctrl) setLoadingSlots(false) }
  }, [slug, selected, date, staffId])

  useEffect(() => { if (step === 'schedule') loadSlots() }, [step, date, staffId, loadSlots])

  // ---------- "Mis citas" (batch, no realtime/polling, 10min TTL) ----------
  const fetchMy = useCallback(async (force) => {
    const tokens = loadTokens(slug)
    if (tokens.length === 0) { setMyAppts([]); return }
    if (!force && Date.now() - lastFetchRef.current < TTL) return
    setLoadingMy(true)
    try {
      const res = await fetch(`/api/store/${slug}/booking/my-appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }), cache: 'no-store' })
      if (res.ok) { const d = await res.json(); setMyAppts(d.appointments || []); lastFetchRef.current = Date.now() }
    } catch { /* ignore */ } finally { setLoadingMy(false) }
  }, [slug])

  useEffect(() => { fetchMy(true) }, [fetchMy])
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') fetchMy(false) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchMy])

  const forget = (token) => { removeToken(slug, token); setMyAppts(a => a.filter(x => x.public_token !== token)) }

  const doRecover = async () => {
    if (!recover.code.trim() || normPhone(recover.phone).length < 6) { toast.error('Ingresá el código y el teléfono completo'); return }
    setRecover(r => ({ ...r, busy: true }))
    try {
      const res = await fetch(`/api/store/${slug}/booking/my-appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recover: { code: recover.code.trim(), phone: recover.phone } }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.public_token) { addToken(slug, d.public_token); setRecover({ open: false, code: '', phone: '', busy: false }); await fetchMy(true); toast.success('¡Cita encontrada!') }
      else { toast.error(d.error || 'No encontramos una cita con esos datos'); setRecover(r => ({ ...r, busy: false })) }
    } catch { toast.error('No se pudo buscar la cita'); setRecover(r => ({ ...r, busy: false })) }
  }

  // ---------- flow navigation ----------
  const goStaff = () => { if (selected.length === 0) { toast.error('Seleccioná al menos un servicio'); return } setStep('staff') }
  const goSchedule = () => setStep('schedule')
  const goDetails = () => { if (!chosenSlot) { toast.error('Seleccioná un horario'); return } setStep('details') }

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Ingresá tu nombre y apellido'); return }
    if (!form.phone.trim()) { toast.error('Ingresá tu WhatsApp / teléfono'); return }
    setSubmitting(true)
    const res = await fetch(`/api/store/${slug}/booking`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_ids: selected, staff_id: chosenSlot.staff_id, start_at: chosenSlot.slot_start, customer_name: form.name, customer_phone: form.phone, customer_email: form.email, customer_notes: form.notes })
    })
    const result = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (res.ok) {
      const code = result.confirmationCode || result.confirmation_code
      const token = result.publicToken || result.public_token
      if (token) addToken(slug, token)
      setConfirmation({ code, token, staff_id: chosenSlot.staff_id, slot_start: chosenSlot.slot_start, sel: totals.sel, price: totals.price, dur: totals.dur })
      setStep('done')
      fetchMy(true)
    } else {
      toast.error(result.error || 'No se pudo crear la reserva')
    }
  }

  const reset = () => { setStep('services'); setSelected([]); setStaffId('any'); setDate(todayStr()); setSlots([]); setChosenSlot(null); setForm({ name: '', phone: '', email: '', notes: '' }); setConfirmation(null) }
  const close = () => { setOpen(false); setTimeout(reset, 300) }
  const staffName = (id) => staff.find(s => s.id === id)?.name || 'Cualquier profesional'

  const copyConfirmation = async () => {
    const c = confirmation
    const txt = `Reserva confirmada\nCódigo: ${c.code}\n${c.sel.map(s => `${catNameOf(s)} - ${s.name}`).join('\n')}\nProfesional: ${staffName(c.staff_id)}\n${fmtLong(c.slot_start)}\nDuración: ${c.dur} min\nPrecio: ${fp(c.price)}`
    try { await navigator.clipboard.writeText(txt); toast.success('Datos copiados') } catch { toast.error('No se pudo copiar') }
  }

  const waSummary = () => {
    const c = confirmation
    const svc = c.sel.map(s => s.name).join(', ')
    const msg = `Hola! Confirmo mi reserva:%0A%0A🗓️ ${fmtLong(c.slot_start)}%0A✂️ ${svc}%0A👤 ${staffName(c.staff_id)}%0A🔖 Código: ${c.code || ''}%0A👋 A nombre de ${form.name}`
    window.open(`https://wa.me/${normPhone(businessPhone)}?text=${msg}`, '_blank')
  }

  if (loading || !data) return null

  const hasServices = services.length > 0

  return (
    <>
      {/* "Mis citas" */}
      {myAppts.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: brandColor }}><CalendarClock className="w-5 h-5" />Mis citas</h2>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => fetchMy(true)} disabled={loadingMy}>{loadingMy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}Actualizar</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {myAppts.map(a => {
              const st = MY_STATUS[a.status] || MY_STATUS.pending
              const rescheduled = (a.reschedule_count || 0) > 0
              return (
                <Card key={a.public_token} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{rescheduled && a.status !== 'cancelled' ? 'Tu cita fue reprogramada' : st.label}</span>
                      <button onClick={() => forget(a.public_token)} className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-0.5"><X className="w-3 h-3" />Olvidar</button>
                    </div>
                    <p className="font-semibold mt-2 capitalize">{fmtLong(a.start_at)}</p>
                    <p className="text-sm text-muted-foreground">{(a.services || []).join(', ')}</p>
                    <p className="text-sm text-muted-foreground">{a.staff_name || 'Profesional'} · {fp(a.total_price)}</p>
                    {a.confirmation_code && <p className="text-xs text-muted-foreground mt-1">Código: <span className="font-mono font-semibold">{a.confirmation_code}</span></p>}
                    {rescheduled && a.previous_start_at && a.status !== 'cancelled' && (
                      <div className="mt-2 text-xs rounded-md bg-amber-50 border border-amber-200 p-2 text-amber-800">
                        <p>Fecha anterior: <span className="line-through">{fmtDateTime(a.previous_start_at)}</span></p>
                        <p>Nueva fecha: <span className="font-semibold">{fmtDateTime(a.start_at)}</span></p>
                        {a.rescheduled_at && <p>Reprogramada el {fmtDateTime(a.rescheduled_at)}</p>}
                        {(a.reschedule_count || 0) > 1 && <p>{a.reschedule_count} reprogramaciones</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Entry banner — always visible for a booking business */}
      <section id="servicios" className="mb-8">
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${brandColor}, #831843)` }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2"><CalendarDays className="w-6 h-6" />Reservá tu turno</h2>
              <p className="text-white/85 text-sm mt-1">{hasServices ? 'Elegí categoría, servicio y horario. ¡Listo!' : 'No hay servicios disponibles por el momento.'}</p>
            </div>
            <Button size="lg" className="bg-white text-gray-900 hover:bg-white/90 font-bold disabled:opacity-60" disabled={!hasServices} onClick={() => setOpen(true)}>Reservar ahora</Button>
          </div>
        </div>

        {myAppts.length === 0 && (
          <div className="mt-3 text-center">
            <button onClick={() => setRecover(r => ({ ...r, open: true }))} className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"><Search className="w-3.5 h-3.5" />Ya tengo una cita, buscarla</button>
          </div>
        )}

        {hasServices && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {services.slice(0, 6).map(s => (
              <Card key={s.id} className="overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => { setSelected([s.id]); if (s.category_id && catIds.has(s.category_id)) setCategory(s.category_id); setOpen(true) }}>
                {s.image_url && <img src={s.image_url} alt={s.name} className="w-full h-28 object-cover" />}
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold truncate">{s.name}</p>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" />{s.duration_minutes}m</span>
                  </div>
                  <p className="text-sm font-bold mt-1" style={{ color: brandColor }}>
                    {s.promo_active && s.promo_price != null ? <><span className="line-through text-muted-foreground mr-1 font-normal">{fp(s.price)}</span>{fp(s.promo_price)}</> : fp(s.price)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recover dialog */}
      <Dialog open={recover.open} onOpenChange={(o) => setRecover(r => ({ ...r, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Search className="w-5 h-5" />Buscar mi cita</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ingresá el código de confirmación y el teléfono completo con el que reservaste.</p>
            <div><Label>Código de confirmación</Label><Input value={recover.code} onChange={e => setRecover(r => ({ ...r, code: e.target.value }))} placeholder="Ej: ABC123" /></div>
            <div><Label>Teléfono (WhatsApp)</Label><Input value={recover.phone} onChange={e => setRecover(r => ({ ...r, phone: e.target.value }))} placeholder="09XX XXX XXX" /></div>
            <Button className="w-full" style={{ background: brandColor }} onClick={doRecover} disabled={recover.busy}>{recover.busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Buscar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Booking dialog */}
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-lg">
          {/* STEP 1: CATEGORY + SERVICES */}
          {step === 'services' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5" />Elegí categoría y servicios</DialogTitle></DialogHeader>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map(id => { const s = serviceById(id); return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 text-white" style={{ background: brandColor }}>{s?.name}<button onClick={() => toggle(id)}><X className="w-3 h-3" /></button></span>
                  )})}
                </div>
              )}
              {pickerCats.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {pickerCats.map(c => (
                    <button key={c.id} onClick={() => setCategory(c.id)} className={`px-3 py-1.5 rounded-full text-sm border ${category === c.id ? 'text-white' : ''}`} style={category === c.id ? { background: brandColor, borderColor: brandColor } : {}}>{c.name}</button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {servicesInCat(category).length === 0
                  ? <p className="text-sm text-muted-foreground py-4">No hay servicios en esta categoría.</p>
                  : servicesInCat(category).map(s => <ServiceRow key={s.id} s={s} selected={selected.includes(s.id)} onToggle={() => toggle(s.id)} fp={fp} brandColor={brandColor} />)}
              </div>
              <div className="sticky bottom-0 bg-background pt-3 border-t mt-2">
                <div className="flex items-center justify-between mb-2 text-sm"><span className="text-muted-foreground">{selected.length} servicio(s) · {totals.dur} min</span><span className="font-bold">{fp(totals.price)}</span></div>
                <Button className="w-full" style={{ background: brandColor }} onClick={goStaff} disabled={selected.length === 0}>Continuar</Button>
              </div>
            </>
          )}

          {/* STEP 2: PROFESSIONAL */}
          {step === 'staff' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="w-5 h-5" />Elegí profesional</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <button onClick={() => setStaffId('any')} className={`w-full text-left p-3 rounded-lg border ${staffId === 'any' ? 'ring-2' : 'hover:bg-muted'}`} style={staffId === 'any' ? { borderColor: brandColor, boxShadow: `0 0 0 1px ${brandColor}` } : {}}>
                  <span className="font-medium">Cualquier profesional</span>
                  <span className="block text-xs text-muted-foreground">Te asignamos el primero disponible</span>
                </button>
                {eligibleStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Ningún profesional realiza todos los servicios elegidos. Podés continuar con "Cualquier profesional".</p>
                ) : eligibleStaff.map(st => (
                  <button key={st.id} onClick={() => setStaffId(st.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg border ${staffId === st.id ? 'ring-2' : 'hover:bg-muted'}`} style={staffId === st.id ? { borderColor: brandColor, boxShadow: `0 0 0 1px ${brandColor}` } : {}}>
                    {st.photo_url ? <img src={st.photo_url} alt={st.name} className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: st.color || brandColor }}>{st.name?.[0]?.toUpperCase()}</span>}
                    <span className="font-medium">{st.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button variant="outline" onClick={() => setStep('services')} className="gap-1"><ChevronLeft className="w-4 h-4" />Atrás</Button>
                <Button className="flex-1" style={{ background: brandColor }} onClick={goSchedule}>Continuar</Button>
              </div>
            </>
          )}

          {/* STEP 3: DATE + TIME */}
          {step === 'schedule' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5" />Elegí fecha y horario</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Fecha</Label><Input type="date" min={todayStr()} value={date} onChange={(e) => { setDate(e.target.value); setChosenSlot(null) }} />
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{(() => { try { return new Date(date + 'T00:00:00').toLocaleDateString('es-PY', { weekday: 'long', day: '2-digit', month: 'long' }) } catch { return '' } })()}</p>
                </div>
                <div>
                  <Label>Horarios disponibles</Label>
                  {loadingSlots ? <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />Cargando...</div> : slots.length === 0 ? <p className="text-sm text-muted-foreground py-4">No hay horarios disponibles para este día. Probá otra fecha.</p> : (
                    <div className="grid grid-cols-3 gap-2 mt-2 max-h-60 overflow-y-auto">
                      {slots.map((sl, i) => {
                        const active = chosenSlot && chosenSlot.slot_start === sl.slot_start && chosenSlot.staff_id === sl.staff_id
                        return <button key={i} onClick={() => setChosenSlot(sl)} className={`px-2 py-2 rounded-md text-sm border ${active ? 'text-white' : 'hover:border-primary'}`} style={active ? { background: brandColor, borderColor: brandColor } : {}}>{fmtSlot(sl.slot_start)}{staffId === 'any' && sl.staff_name && <span className="block text-[10px] opacity-70 truncate">{sl.staff_name}</span>}</button>
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button variant="outline" onClick={() => setStep('staff')} className="gap-1"><ChevronLeft className="w-4 h-4" />Atrás</Button>
                <Button className="flex-1" style={{ background: brandColor }} onClick={goDetails} disabled={!chosenSlot}>Continuar</Button>
              </div>
            </>
          )}

          {/* STEP 4: DETAILS */}
          {step === 'details' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="w-5 h-5" />Tus datos</DialogTitle></DialogHeader>
              <div className="rounded-md bg-muted p-3 text-sm mb-3">
                <p className="font-medium capitalize">{fmtLong(chosenSlot?.slot_start)}</p>
                <p className="text-muted-foreground">{totals.sel.map(s => s.name).join(', ')} · {staffName(chosenSlot?.staff_id)}</p>
                <p className="font-bold mt-1">{fp(totals.price)} · {totals.dur} min</p>
              </div>
              <div className="space-y-3">
                <div><Label>Nombre y apellido *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>WhatsApp / Teléfono *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Email (opcional)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Observaciones (opcional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button variant="outline" onClick={() => setStep('schedule')} className="gap-1"><ChevronLeft className="w-4 h-4" />Atrás</Button>
                <Button className="flex-1" style={{ background: brandColor }} onClick={submit} disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Reservando...</> : 'Confirmar reserva'}</Button>
              </div>
            </>
          )}

          {/* STEP 5: DONE */}
          {step === 'done' && confirmation && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2 text-green-600"><PartyPopper className="w-5 h-5" />¡Tu cita quedó agendada!</DialogTitle></DialogHeader>
              <div className="text-center py-2 space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto"><Check className="w-8 h-8 text-green-600" /></div>
                <p className="text-sm text-muted-foreground">Tu código de confirmación es</p>
                <p className="text-2xl font-extrabold tracking-wider">{confirmation.code}</p>
                <div className="rounded-md bg-muted p-3 text-sm text-left space-y-0.5">
                  <p><span className="text-muted-foreground">Categoría:</span> {confirmation.sel.map(s => catNameOf(s)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p>
                  <p><span className="text-muted-foreground">Servicio:</span> {confirmation.sel.map(s => s.name).join(', ')}</p>
                  <p><span className="text-muted-foreground">Profesional:</span> {staffName(confirmation.staff_id)}</p>
                  <p className="capitalize"><span className="text-muted-foreground">Fecha:</span> {fmtLong(confirmation.slot_start)}</p>
                  <p><span className="text-muted-foreground">Duración:</span> {confirmation.dur} min</p>
                  <p><span className="text-muted-foreground">Precio:</span> {fp(confirmation.price)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-1" onClick={copyConfirmation}><Copy className="w-4 h-4" />Copiar</Button>
                  {businessPhone ? <Button className="bg-green-500 hover:bg-green-600 gap-1" onClick={waSummary}><MessageCircle className="w-4 h-4" />WhatsApp</Button> : <span />}
                </div>
                <Button variant="ghost" className="w-full" onClick={close}>Cerrar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ServiceRow({ s, selected, onToggle, fp, brandColor }) {
  return (
    <button onClick={onToggle} className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition ${selected ? 'ring-2' : 'hover:bg-muted'}`} style={selected ? { borderColor: brandColor, boxShadow: `0 0 0 1px ${brandColor}` } : {}}>
      <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${selected ? 'text-white' : ''}`} style={selected ? { background: brandColor, borderColor: brandColor } : {}}>{selected && <Check className="w-3.5 h-3.5" />}</span>
      {s.image_url && <img src={s.image_url} alt="" className="w-11 h-11 rounded-md object-cover flex-shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{s.name}</span>
        <span className="block text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_minutes} min</span>
      </span>
      <span className="font-bold flex-shrink-0" style={{ color: brandColor }}>{s.promo_active && s.promo_price != null ? fp(s.promo_price) : fp(s.price)}</span>
    </button>
  )
}
