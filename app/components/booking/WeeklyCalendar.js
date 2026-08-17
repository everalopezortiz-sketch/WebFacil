'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { authFetch, WEEKDAYS, STATUS_META, isoDay, ymd, startOfWeek, addDays, fmtTime } from '@/lib/booking/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import AppointmentDialog from './AppointmentDialog'

export default function WeeklyCalendar({ supabase, profile, staff = [], services = [], staffServices = [], onDataChange }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [staffFilter, setStaffFilter] = useState('all')
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState({ open: false, mode: 'create', initial: null, appointment: null })
  const [mobileDay, setMobileDay] = useState(() => isoDay(new Date()) - 1)
  const channelRef = useRef(null)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const loadWeek = useCallback(async () => {
    setLoading(true)
    const start = new Date(weekStart); start.setHours(0,0,0,0)
    const end = addDays(weekStart, 7); end.setHours(0,0,0,0)
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
    if (staffFilter !== 'all') params.set('staff_id', staffFilter)
    const res = await authFetch(supabase, `/api/booking/appointments?${params}`)
    if (res.ok) setAppts(await res.json())
    setLoading(false)
  }, [weekStart, staffFilter, supabase])

  useEffect(() => { loadWeek() }, [loadWeek])

  // Realtime: subscribe to this business's appointments (INSERT/UPDATE). Re-fetch the visible week on relevant events.
  useEffect(() => {
    if (!profile?.id) return
    const ch = supabase.channel(`appts-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments', filter: `user_id=eq.${profile.id}` }, () => loadWeek())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `user_id=eq.${profile.id}` }, () => loadWeek())
      .subscribe()
    channelRef.current = ch
    return () => { try { supabase.removeChannel(ch) } catch {} }
  }, [profile?.id, loadWeek, supabase])

  const apptsForDay = (date) => {
    const key = ymd(date)
    return appts.filter(a => {
      const d = new Date(a.start_at)
      return ymd(d) === key
    }).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  }

  const staffColor = (id) => staff.find(s => s.id === id)?.color || '#7c3aed'

  const openCreate = (date) => setDialog({ open: true, mode: 'create', initial: { date: ymd(date), time: '09:00', staffId: staffFilter !== 'all' ? staffFilter : undefined }, appointment: null })
  const openView = (appt) => setDialog({ open: true, mode: 'view', initial: null, appointment: appt })

  const changed = () => { loadWeek(); onDataChange?.() }

  const ApptCard = ({ a }) => {
    const isCancelled = a.status === 'cancelled'
    return (
      <button onClick={() => openView(a)} className={`w-full text-left rounded-md border-l-4 p-2 mb-1.5 text-xs shadow-sm hover:shadow transition ${isCancelled ? 'opacity-60' : ''}`} style={{ borderLeftColor: staffColor(a.staff_id), background: (STATUS_META[a.status]?.color || '#7c3aed') + '18' }}>
        <div className="font-semibold">{fmtTime(a.start_at)} - {fmtTime(a.end_at)}</div>
        <div className="truncate font-medium">{a.customer_name}</div>
        <div className="truncate text-muted-foreground">{(a.appointment_services || []).map(s => s.service_name).join(', ')}</div>
        <div className="flex items-center justify-between mt-1"><span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: STATUS_META[a.status]?.color, color: '#fff' }}>{STATUS_META[a.status]?.label}</span><span className="font-semibold">{a.total_price}</span></div>
      </button>
    )
  }

  const weekLabel = `${days[0].toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })} - ${days[6].toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoy</Button>
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
          <span className="font-medium ml-2">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos los profesionales</SelectItem>{staff.filter(s => s.is_active).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="gap-1" onClick={() => openCreate(new Date())}><Plus className="w-4 h-4" />Nueva</Button>
        </div>
      </div>

      {/* Desktop: 7 columns */}
      <div className="hidden md:grid grid-cols-7 gap-2">
        {days.map((date, i) => {
          const isToday = ymd(date) === ymd(new Date())
          return (
            <div key={i} className="min-h-[200px]">
              <div className={`text-center py-2 rounded-t-md text-sm font-medium ${isToday ? 'gradient-brand text-white' : 'bg-muted'}`}>
                {WEEKDAYS[i].short}<div className="text-xs font-normal">{date.getDate()}</div>
              </div>
              <div className="p-1.5 bg-white/40 rounded-b-md border min-h-[160px]">
                {apptsForDay(date).map(a => <ApptCard key={a.id} a={a} />)}
                <button onClick={() => openCreate(date)} className="w-full text-xs text-muted-foreground hover:text-primary py-1 rounded border border-dashed mt-1">+ Agendar</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile: single day selector */}
      <div className="md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {days.map((date, i) => {
            const isToday = ymd(date) === ymd(new Date())
            return (
              <button key={i} onClick={() => setMobileDay(i)} className={`flex-shrink-0 px-3 py-2 rounded-md text-sm ${mobileDay === i ? 'gradient-brand text-white' : isToday ? 'bg-primary/10' : 'bg-muted'}`}>
                {WEEKDAYS[i].short}<div className="text-xs">{date.getDate()}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-2">
          {apptsForDay(days[mobileDay]).length === 0 ? <p className="text-center text-muted-foreground py-6 text-sm">Sin reservas este día</p> : apptsForDay(days[mobileDay]).map(a => <ApptCard key={a.id} a={a} />)}
          <Button variant="outline" className="w-full mt-2 gap-1" onClick={() => openCreate(days[mobileDay])}><Plus className="w-4 h-4" />Nueva reserva</Button>
        </div>
      </div>

      <AppointmentDialog supabase={supabase} open={dialog.open} mode={dialog.mode} initial={dialog.initial} appointment={dialog.appointment} staff={staff} services={services} staffServices={staffServices} onChanged={changed} onClose={() => setDialog({ ...dialog, open: false })} />
    </div>
  )
}
