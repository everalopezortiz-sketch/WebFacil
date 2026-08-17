'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Clock, Check, ChevronLeft, CalendarDays, Scissors, User, MessageCircle, Loader2, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'

function todayStr() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtSlot(iso) {
  try { return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '' }
}

export default function StoreBooking({ slug, brandColor = '#7c3aed', formatPrice, businessPhone }) {
  const fp = formatPrice || ((n) => `${n}`)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('services')
  const [selected, setSelected] = useState([])
  const [staffId, setStaffId] = useState('any')
  const [date, setDate] = useState(todayStr())
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [chosenSlot, setChosenSlot] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState(null)

  useEffect(() => {
    fetch(`/api/store/${slug}/booking`).then(r => r.ok ? r.json() : null).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [slug])

  const services = data?.services || []
  const categories = data?.serviceCategories || []
  const staff = data?.staff || []
  const staffServices = data?.staffServices || []
  const settings = data?.settings || {}

  const totals = useMemo(() => {
    const sel = services.filter(s => selected.includes(s.id))
    const price = sel.reduce((a, s) => a + Number((s.promo_active && s.promo_price != null) ? s.promo_price : s.price || 0), 0)
    const dur = sel.reduce((a, s) => a + Number(s.duration_minutes || 0), 0)
    return { price, dur, sel }
  }, [selected, services])

  // Staff that can perform ALL selected services
  const eligibleStaff = useMemo(() => {
    if (selected.length === 0) return staff
    return staff.filter(st => {
      const ids = staffServices.filter(ss => ss.staff_id === st.id).map(ss => ss.service_id)
      return selected.every(sid => ids.includes(sid))
    })
  }, [selected, staff, staffServices])

  const toggle = (id) => {
    if (!settings.allow_multiple_services) { setSelected([id]); return }
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const loadSlots = async () => {
    setLoadingSlots(true); setChosenSlot(null)
    const params = new URLSearchParams({ service_ids: selected.join(','), date })
    if (staffId !== 'any') params.set('staff_id', staffId)
    const res = await fetch(`/api/store/${slug}/booking/availability?${params}`)
    if (res.ok) setSlots(await res.json()); else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'No se pudieron cargar los horarios'); setSlots([]) }
    setLoadingSlots(false)
  }

  useEffect(() => { if (step === 'schedule' && selected.length > 0) loadSlots() }, [step, date, staffId])

  const goSchedule = () => {
    if (selected.length === 0) { toast.error('Selecciona al menos un servicio'); return }
    setStep('schedule')
  }
  const goDetails = () => {
    if (!chosenSlot) { toast.error('Selecciona un horario'); return }
    setStep('details')
  }

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Ingresa tu nombre'); return }
    if (settings.require_phone && !form.phone.trim()) { toast.error('Ingresa tu teléfono'); return }
    setSubmitting(true)
    const res = await fetch(`/api/store/${slug}/booking`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_ids: selected, staff_id: chosenSlot.staff_id, start_at: chosenSlot.slot_start, customer_name: form.name, customer_phone: form.phone, customer_email: form.email, customer_notes: form.notes })
    })
    const result = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (res.ok) {
      const code = result.confirmationCode || result.confirmation_code
      setConfirmation({ code, ...result })
      setStep('done')
    } else {
      toast.error(result.error || 'No se pudo crear la reserva')
    }
  }

  const reset = () => { setStep('services'); setSelected([]); setStaffId('any'); setDate(todayStr()); setSlots([]); setChosenSlot(null); setForm({ name: '', phone: '', email: '', notes: '' }); setConfirmation(null) }
  const close = () => { setOpen(false); setTimeout(reset, 300) }

  const staffName = (id) => staff.find(s => s.id === id)?.name || 'Profesional'

  const waSummary = () => {
    const dt = chosenSlot ? new Date(chosenSlot.slot_start).toLocaleString('es-PY', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''
    const svc = totals.sel.map(s => s.name).join(', ')
    const msg = `Hola! Confirmo mi reserva:%0A%0A🗓️ ${dt}%0A✂️ ${svc}%0A👤 ${staffName(chosenSlot?.staff_id)}%0A🔖 Código: ${confirmation?.code || ''}%0A👋 A nombre de ${form.name}`
    const phone = (businessPhone || '').replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  if (loading || !data || services.length === 0) return null

  return (
    <>
      {/* Entry banner in the public store */}
      <section id="servicios" className="mb-8">
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${brandColor}, #831843)` }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2"><CalendarDays className="w-6 h-6" />Reservá tu turno</h2>
              <p className="text-white/85 text-sm mt-1">{services.length} servicio(s) disponible(s). Elegí, seleccioná horario y listo.</p>
            </div>
            <Button size="lg" className="bg-white text-gray-900 hover:bg-white/90 font-bold" onClick={() => setOpen(true)}>Reservar ahora</Button>
          </div>
        </div>

        {/* Quick preview of services */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {services.slice(0, 6).map(s => (
            <Card key={s.id} className="overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => { setSelected([s.id]); setOpen(true) }}>
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
      </section>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-lg">
          {/* STEP: SERVICES */}
          {step === 'services' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5" />Elegí tus servicios</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {categories.filter(c => services.some(s => s.category_id === c.id)).map(cat => (
                  <div key={cat.id}>
                    <p className="text-sm font-semibold text-muted-foreground mb-1">{cat.name}</p>
                    <div className="space-y-2">{services.filter(s => s.category_id === cat.id).map(s => <ServiceRow key={s.id} s={s} selected={selected.includes(s.id)} onToggle={() => toggle(s.id)} fp={fp} brandColor={brandColor} />)}</div>
                  </div>
                ))}
                {services.filter(s => !s.category_id || !categories.some(c => c.id === s.category_id)).length > 0 && (
                  <div className="space-y-2">{services.filter(s => !s.category_id || !categories.some(c => c.id === s.category_id)).map(s => <ServiceRow key={s.id} s={s} selected={selected.includes(s.id)} onToggle={() => toggle(s.id)} fp={fp} brandColor={brandColor} />)}</div>
                )}
              </div>
              <div className="sticky bottom-0 bg-background pt-3 border-t mt-2">
                <div className="flex items-center justify-between mb-2 text-sm"><span className="text-muted-foreground">{selected.length} servicio(s) · {totals.dur} min</span><span className="font-bold">{fp(totals.price)}</span></div>
                <Button className="w-full" style={{ background: brandColor }} onClick={goSchedule} disabled={selected.length === 0}>Continuar</Button>
              </div>
            </>
          )}

          {/* STEP: SCHEDULE */}
          {step === 'schedule' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5" />Elegí fecha y horario</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {settings.allow_staff_choice && (
                  <div>
                    <Label>Profesional</Label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      <button onClick={() => setStaffId('any')} className={`px-3 py-1.5 rounded-full text-sm border ${staffId === 'any' ? 'text-white' : ''}`} style={staffId === 'any' ? { background: brandColor, borderColor: brandColor } : {}}>Cualquiera</button>
                      {eligibleStaff.map(st => (
                        <button key={st.id} onClick={() => setStaffId(st.id)} className={`px-3 py-1.5 rounded-full text-sm border ${staffId === st.id ? 'text-white' : ''}`} style={staffId === st.id ? { background: brandColor, borderColor: brandColor } : {}}>{st.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div><Label>Fecha</Label><Input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div>
                  <Label>Horarios disponibles</Label>
                  {loadingSlots ? <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />Cargando...</div> : slots.length === 0 ? <p className="text-sm text-muted-foreground py-4">No hay horarios disponibles para este día. Probá otra fecha.</p> : (
                    <div className="grid grid-cols-3 gap-2 mt-2 max-h-60 overflow-y-auto">
                      {slots.map((sl, i) => {
                        const active = chosenSlot && chosenSlot.slot_start === sl.slot_start && chosenSlot.staff_id === sl.staff_id
                        return <button key={i} onClick={() => setChosenSlot(sl)} className={`px-2 py-2 rounded-md text-sm border ${active ? 'text-white' : 'hover:border-primary'}`} style={active ? { background: brandColor, borderColor: brandColor } : {}}>{fmtSlot(sl.slot_start)}{staffId === 'any' && <span className="block text-[10px] opacity-70 truncate">{sl.staff_name}</span>}</button>
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button variant="outline" onClick={() => setStep('services')} className="gap-1"><ChevronLeft className="w-4 h-4" />Atrás</Button>
                <Button className="flex-1" style={{ background: brandColor }} onClick={goDetails} disabled={!chosenSlot}>Continuar</Button>
              </div>
            </>
          )}

          {/* STEP: DETAILS */}
          {step === 'details' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><User className="w-5 h-5" />Tus datos</DialogTitle></DialogHeader>
              <div className="rounded-md bg-muted p-3 text-sm mb-3">
                <p className="font-medium">{chosenSlot && new Date(chosenSlot.slot_start).toLocaleString('es-PY', { weekday: 'long', day: '2-digit', month: 'long' })} · {fmtSlot(chosenSlot?.slot_start)}</p>
                <p className="text-muted-foreground">{totals.sel.map(s => s.name).join(', ')} · {staffName(chosenSlot?.staff_id)}</p>
                <p className="font-bold mt-1">{fp(totals.price)} · {totals.dur} min</p>
              </div>
              <div className="space-y-3">
                <div><Label>Nombre y apellido</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Teléfono {settings.require_phone && '*'}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Email (opcional)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Observaciones (opcional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="flex gap-2 pt-3 border-t mt-2">
                <Button variant="outline" onClick={() => setStep('schedule')} className="gap-1"><ChevronLeft className="w-4 h-4" />Atrás</Button>
                <Button className="flex-1" style={{ background: brandColor }} onClick={submit} disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Reservando...</> : 'Confirmar reserva'}</Button>
              </div>
            </>
          )}

          {/* STEP: DONE */}
          {step === 'done' && confirmation && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2 text-green-600"><PartyPopper className="w-5 h-5" />¡Reserva confirmada!</DialogTitle></DialogHeader>
              <div className="text-center py-4 space-y-3">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto"><Check className="w-8 h-8 text-green-600" /></div>
                <p className="text-sm text-muted-foreground">Tu código de confirmación es</p>
                <p className="text-2xl font-extrabold tracking-wider">{confirmation.code}</p>
                <div className="rounded-md bg-muted p-3 text-sm text-left">
                  <p className="font-medium">{chosenSlot && new Date(chosenSlot.slot_start).toLocaleString('es-PY', { weekday: 'long', day: '2-digit', month: 'long' })} · {fmtSlot(chosenSlot?.slot_start)}</p>
                  <p className="text-muted-foreground">{totals.sel.map(s => s.name).join(', ')} · {staffName(chosenSlot?.staff_id)}</p>
                </div>
                {businessPhone && <Button className="w-full bg-green-500 hover:bg-green-600 gap-2" onClick={waSummary}><MessageCircle className="w-4 h-4" />Enviar resumen por WhatsApp</Button>}
                <Button variant="outline" className="w-full" onClick={close}>Cerrar</Button>
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
