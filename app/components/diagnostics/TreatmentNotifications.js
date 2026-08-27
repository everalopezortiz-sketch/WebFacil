'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, MessageCircle, CheckCircle2, X, Loader2, Bell } from 'lucide-react'
import { authFetch, fmtDate } from '@/lib/diagnostics/helpers'
import { toast } from 'sonner'

// Paraguay phone normalization: keep digits, convert leading 0 -> 595.
function normalizePhone(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('595')) return d
  if (d.startsWith('0')) return '595' + d.slice(1)
  return d
}

const TYPE_META = {
  tomorrow: { cls: 'border-amber-200 bg-amber-50', dot: 'bg-amber-400', label: 'Mañana debe continuar su tratamiento' },
  today: { cls: 'border-violet-200 bg-violet-50', dot: 'bg-violet-500', label: 'Tratamiento para hoy' },
  overdue: { cls: 'border-red-200 bg-red-50', dot: 'bg-red-500', label: 'Tratamiento pendiente' },
}

export default function TreatmentNotifications({ supabase }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(supabase, '/api/diagnostics/treatment-notifications?limit=25')
      const d = res.ok ? await res.json() : null
      setData(d)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [supabase])

  // Load a single time when the Dashboard/Inicio is visible.
  useEffect(() => { load() }, [load])

  const notifications = data?.notifications || []

  const updateReminder = async (n, action) => {
    setBusyId(n.diagnosticId)
    try {
      const res = await authFetch(supabase, `/api/diagnostics/treatment-notifications/${n.diagnosticId}`, {
        method: 'PUT', body: JSON.stringify({ action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar'); return null }
      return d
    } catch { toast.error('No se pudo actualizar'); return null }
    finally { setBusyId(null) }
  }

  const removeLocal = (diagnosticId, deltaField) => {
    setData(prev => {
      if (!prev) return prev
      const removed = (prev.notifications || []).find(x => x.diagnosticId === diagnosticId)
      const rest = (prev.notifications || []).filter(x => x.diagnosticId !== diagnosticId)
      const next = { ...prev, notifications: rest, total: Math.max(0, (prev.total || rest.length) - 1) }
      if (removed) {
        if (removed.reminderType === 'tomorrow') next.tomorrowCount = Math.max(0, (prev.tomorrowCount || 0) - 1)
        else if (removed.reminderType === 'today') next.todayCount = Math.max(0, (prev.todayCount || 0) - 1)
        else if (removed.reminderType === 'overdue') next.overdueCount = Math.max(0, (prev.overdueCount || 0) - 1)
      }
      return next
    })
  }

  const onWhatsapp = async (n) => {
    const phone = normalizePhone(n.clientPhone)
    if (!phone) { toast.error('Cliente sin teléfono'); return }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(n.suggestedMessage || '')}`
    window.open(url, '_blank')
    const d = await updateReminder(n, 'contacted')
    if (d) {
      setData(prev => prev ? {
        ...prev,
        notifications: prev.notifications.map(x => x.diagnosticId === n.diagnosticId
          ? { ...x, status: 'contacted', messageSentAt: d.messageSentAt || x.messageSentAt || new Date().toISOString() }
          : x),
      } : prev)
    }
  }

  const onComplete = async (n) => {
    const d = await updateReminder(n, 'completed')
    if (d) { removeLocal(n.diagnosticId); toast.success('Tratamiento marcado como completado') }
  }

  const onDismiss = async (n) => {
    if (!confirm(`¿Descartar el aviso de ${n.clientName}? No volverá a mostrarse.`)) return
    const d = await updateReminder(n, 'dismissed')
    if (d) { removeLocal(n.diagnosticId); toast.success('Aviso descartado') }
  }

  if (loading) {
    return (
      <Card className="border-violet-200">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Buscando próximos tratamientos...
        </CardContent>
      </Card>
    )
  }

  // Do not take up space when there are no reminders.
  if (!data || (data.total || 0) === 0 || notifications.length === 0) return null

  return (
    <Card className="border-violet-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-violet-600" /> Próximos tratamientos
          <Badge className="bg-violet-600 text-white ml-1">{data.total}</Badge>
        </CardTitle>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
          {data.tomorrowCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Mañana: {data.tomorrowCount}</span>}
          {data.todayCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" />Hoy: {data.todayCount}</span>}
          {data.overdueCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Vencidos: {data.overdueCount}</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {notifications.map(n => {
            const meta = TYPE_META[n.reminderType] || TYPE_META.today
            const hasPhone = !!normalizePhone(n.clientPhone)
            const label = n.reminderType === 'overdue' ? `Tratamiento pendiente desde ${fmtDate(n.nextTreatmentDate)}` : meta.label
            return (
              <div key={n.diagnosticId} className={`rounded-lg border p-3 space-y-2 ${meta.cls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{n.clientName}</p>
                    <p className="text-xs flex items-center gap-1 mt-0.5"><span className={`w-2 h-2 rounded-full ${meta.dot}`} />{label}</p>
                  </div>
                  {n.status === 'contacted' && <Badge variant="outline" className="text-[10px] shrink-0 bg-white/70">Avisado</Badge>}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Fecha: <span className="font-medium text-foreground">{fmtDate(n.nextTreatmentDate)}</span></p>
                  <p>Tel.: {n.clientPhone || 'Sin teléfono'}</p>
                  {n.nextSessionNotes && <p className="italic">"{n.nextSessionNotes}"</p>}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button size="sm" className="h-8 gap-1 bg-green-500 hover:bg-green-600 text-white flex-1 min-w-[130px]"
                    disabled={!hasPhone || busyId === n.diagnosticId} onClick={() => onWhatsapp(n)}>
                    {busyId === n.diagnosticId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                    {hasPhone ? 'Avisar por WhatsApp' : 'Cliente sin teléfono'}
                  </Button>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 gap-1 flex-1 text-xs" disabled={busyId === n.diagnosticId} onClick={() => onComplete(n)}>
                    <CheckCircle2 className="w-3.5 h-3.5" />Completado
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 flex-1 text-xs text-muted-foreground" disabled={busyId === n.diagnosticId} onClick={() => onDismiss(n)}>
                    <X className="w-3.5 h-3.5" />Descartar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
