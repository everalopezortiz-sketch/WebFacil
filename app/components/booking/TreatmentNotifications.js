'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/booking/client'
import { formatCalendarDate } from '@/lib/booking/dates'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const endpoint = '/api/booking/treatment-reminders'
const reminderLabels = { overdue: 'Vencido', today: 'Para hoy', tomorrow: 'Para mañana' }
const reminderStyles = {
  overdue: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  today: 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40',
  tomorrow: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
}

function whatsappLink({ customer_name: name, customer_phone: phone, due_on: date, kind }) {
  if (!phone) return null
  let number = phone.replace(/\D/g, '')
  if (number.startsWith('00')) number = number.slice(2)
  else if (!phone.trim().startsWith('+')) {
    if (/^0\d{8,9}$/.test(number)) number = '595' + number.slice(1)
    else if (/^9\d{8}$/.test(number)) number = '595' + number
  }
  if (!/^[1-9]\d{7,14}$/.test(number)) return null
  const message = kind === 'overdue'
    ? 'Hola, ' + name + '. Ya llegó la fecha de tu próximo tratamiento. ¿Querés coordinar un turno?'
    : 'Hola, ' + name + '. Te recordamos que tu próximo tratamiento corresponde al ' + formatCalendarDate(date) + '. ¿Querés coordinar un turno?'
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(message)
}

export default function TreatmentNotifications({ supabase, refreshKey, onCountChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(null)
  const request = useRef(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const res = await authFetch(supabase, endpoint, { cache: 'no-store', signal: controller.signal })
      if (!res.ok) throw new Error()
      const result = await res.json()
      if (!controller.signal.aborted) {
        setData(result)
        setError(false)
        onCountChange(result.total)
      }
    } catch {
      if (!controller.signal.aborted) setError(true)
    }
  }, [supabase, onCountChange])

  useEffect(() => {
    load()
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      request.current?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load, refreshKey])

  const update = async (reminder, status) => {
    if (busy) return
    if (status === 'dismissed' && !window.confirm('¿Descartar el aviso de ' + reminder.customer_name + '?')) return
    setBusy(reminder.id)
    try {
      const res = await authFetch(supabase, endpoint + '/' + reminder.id, {
        method: 'PUT', body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        if (res.status === 404) await load()
        const result = await res.json()
        throw new Error(result.error)
      }
      if (status === 'completed') toast.success('Tratamiento marcado como completado')
      if (status === 'dismissed') toast.success('Aviso descartado')
      await load()
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar el recordatorio.')
    } finally {
      setBusy(null)
    }
  }

  if (error && !data?.total) {
    return <Card><CardContent className="p-4 flex flex-wrap items-center gap-2 text-sm" role="alert">
      No se pudieron cargar los recordatorios.
      <Button size="sm" variant="outline" onClick={load}>Reintentar</Button>
    </CardContent></Card>
  }
  if (!data?.total) return null

  return (
    <Card className="border-violet-200 dark:border-violet-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Bell className="size-5 text-violet-600 dark:text-violet-400" />Próximos tratamientos <Badge>{data.total}</Badge></CardTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {data.todayCount > 0 && <span>{data.todayCount} para hoy</span>}
          {data.tomorrowCount > 0 && <span>{data.tomorrowCount} para mañana</span>}
          {data.overdueCount > 0 && <span className="font-medium text-red-700 dark:text-red-400">{data.overdueCount} {data.overdueCount === 1 ? 'vencido' : 'vencidos'}</span>}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-muted-foreground" role="alert">No se pudo actualizar la lista. <button type="button" className="underline" onClick={load}>Reintentar</button></p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.reminders.map(reminder => {
            const link = whatsappLink(reminder)
            return (
              <article key={reminder.id} className={'min-w-0 rounded-lg border p-3 space-y-2 ' + reminderStyles[reminder.kind]}>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h3 className="text-sm font-semibold break-words min-w-0">{reminder.customer_name}</h3>
                  {reminder.status === 'contacted' && <Badge variant="outline">Avisado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{reminderLabels[reminder.kind]} · {formatCalendarDate(reminder.due_on)}</p>
                {reminder.notes && <p className="text-sm whitespace-pre-wrap break-words">{reminder.notes}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  {link && <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={link} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />Abrir WhatsApp</a>
                  </Button>}
                  {reminder.status === 'pending' && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => update(reminder, 'contacted')}>Marcar avisado</Button>}
                  <Button size="sm" variant="ghost" className="gap-1" disabled={!!busy} onClick={() => update(reminder, 'completed')}>
                    {busy === reminder.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Completado
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => update(reminder, 'dismissed')}>Descartar</Button>
                </div>
              </article>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
