'use client'
import React, { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { STATUS_META, fmtTime } from '@/lib/booking/client'
import { CalendarCheck, Clock, XCircle, UserX, TrendingUp, CalendarClock } from 'lucide-react'

export default function BookingOverview({ appts = [], staff = [] }) {
  const stats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    const now = new Date()
    const today = appts.filter(a => a.start_at?.slice(0, 10) === todayKey && a.status !== 'cancelled')
    const confirmed = appts.filter(a => a.status === 'confirmed')
    const pending = appts.filter(a => a.status === 'pending')
    const cancelled = appts.filter(a => a.status === 'cancelled')
    const noShow = appts.filter(a => a.status === 'no_show')
    const completed = appts.filter(a => a.status === 'completed')
    const revenue = completed.reduce((a, x) => a + Number(x.total_price || 0), 0)
    const upcoming = appts.filter(a => new Date(a.start_at) >= now && ['pending', 'confirmed'].includes(a.status)).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0]
    // most booked services
    const svcCount = {}
    appts.forEach(a => (a.appointment_services || []).forEach(s => { svcCount[s.service_name] = (svcCount[s.service_name] || 0) + 1 }))
    const topServices = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const staffCount = {}
    appts.forEach(a => { if (a.staff_id) staffCount[a.staff_id] = (staffCount[a.staff_id] || 0) + 1 })
    const topStaff = Object.entries(staffCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { today: today.length, confirmed: confirmed.length, pending: pending.length, cancelled: cancelled.length, noShow: noShow.length, revenue, upcoming, topServices, topStaff }
  }, [appts])

  const staffName = (id) => staff.find(s => s.id === id)?.name || 'Profesional'
  const Stat = ({ icon: Icon, label, value, color }) => (
    <Card><CardContent className="p-4"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: color + '22', color }}><Icon className="w-5 h-5" /></span><div><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div></CardContent></Card>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={CalendarCheck} label="Citas hoy" value={stats.today} color="#7c3aed" />
        <Stat icon={Clock} label="Pendientes" value={stats.pending} color="#f59e0b" />
        <Stat icon={CalendarCheck} label="Confirmadas" value={stats.confirmed} color="#3b82f6" />
        <Stat icon={XCircle} label="Canceladas" value={stats.cancelled} color="#ef4444" />
        <Stat icon={UserX} label="No asistieron" value={stats.noShow} color="#6b7280" />
        <Stat icon={TrendingUp} label="Ingresos (completadas)" value={stats.revenue} color="#16a34a" />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="font-semibold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4" />Próxima cita</p>{stats.upcoming ? <div className="text-sm"><p className="font-medium">{stats.upcoming.customer_name}</p><p className="text-muted-foreground">{new Date(stats.upcoming.start_at).toLocaleString('es-PY', { weekday: 'short', day: '2-digit', month: 'short' })} · {fmtTime(stats.upcoming.start_at)}</p><p>{staffName(stats.upcoming.staff_id)}</p></div> : <p className="text-sm text-muted-foreground">Sin citas próximas</p>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="font-semibold mb-2">Servicios más reservados</p>{stats.topServices.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos</p> : <ul className="text-sm space-y-1">{stats.topServices.map(([n, c]) => <li key={n} className="flex justify-between"><span className="truncate">{n}</span><span className="font-medium">{c}</span></li>)}</ul>}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="font-semibold mb-2">Profesionales con más citas</p>{stats.topStaff.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos</p> : <ul className="text-sm space-y-1">{stats.topStaff.map(([id, c]) => <li key={id} className="flex justify-between"><span className="truncate">{staffName(id)}</span><span className="font-medium">{c}</span></li>)}</ul>}</CardContent></Card>
      </div>
    </div>
  )
}
