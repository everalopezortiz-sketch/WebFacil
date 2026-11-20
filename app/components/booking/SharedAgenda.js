'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addCalendarMonths, bookingDate, formatCalendarDate, isCalendarDate, MONTH_PATTERN } from '@/lib/booking/dates'

function stepDate(date, period, direction) {
  if (period === 'month') return addCalendarMonths(date.slice(0, 7) + '-01', direction)
  const next = new Date(date + 'T00:00:00Z')
  next.setUTCDate(next.getUTCDate() + direction)
  return next.toISOString().slice(0, 10)
}

export default function SharedAgenda({ slug, view, period: initialPeriod, date: initialDate }) {
  const [period, setPeriod] = useState(initialPeriod)
  const [date, setDate] = useState(initialDate)
  const [selected, setSelected] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const booked = view === 'booked'
  const monthly = period === 'month'
  const title = booked ? 'Turnos agendados' : 'Horarios disponibles'
  const query = new URLSearchParams({ view, period })
  if (date) query.set('date', date)
  const queryString = query.toString()
  const current = data?.query === queryString ? data : null
  const currentDate = date || current?.date || bookingDate()
  const today = data?.today || bookingDate()
  const lastDate = data?.lastDate
  const activeDay = current?.days.find(day => day.date === selected) || current?.days[0]

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    const load = async () => {
      try {
        const response = await fetch('/api/store/' + encodeURIComponent(slug) + '/booking/calendar?' + queryString, {
          cache: 'no-store', signal: controller.signal,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los horarios.')
        if (!controller.signal.aborted) setData({ ...result, query: queryString })
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'No se pudieron cargar los horarios.')
      }
    }
    load()
    return () => controller.abort()
  }, [slug, queryString, retryCount])

  const previous = stepDate(currentDate, period, -1)
  const next = stepDate(currentDate, period, 1)
  const canGoBack = monthly ? previous.slice(0, 7) >= today.slice(0, 7) : previous >= today
  const canGoForward = !lastDate || (monthly ? next.slice(0, 7) <= lastDate.slice(0, 7) : next <= lastDate)
  const changeDate = (value) => {
    setDate(value)
    setSelected('')
  }
  const changePeriod = (value) => {
    if (period === value) return
    setPeriod(value)
    changeDate(value === 'day' ? activeDay?.date || (currentDate < today ? today : currentDate) : currentDate)
  }
  const dateLabel = formatCalendarDate(currentDate, monthly
    ? { month: 'long', year: 'numeric' }
    : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <main className="min-h-dvh bg-violet-50/70 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-5 flex items-center gap-3 sm:gap-4">
          <div className="shrink-0 rounded-xl bg-violet-600 p-2.5 text-white sm:p-3"><CalendarDays className="size-6" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 capitalize">{dateLabel}</p>
          </div>
        </header>

        <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="shared-agenda-date">{monthly ? 'Mes' : 'Fecha'}</Label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="shrink-0" aria-label={monthly ? 'Mes anterior' : 'Día anterior'}
                  disabled={!canGoBack} onClick={() => changeDate(previous)}><ChevronLeft className="size-4" /></Button>
                <Input id="shared-agenda-date" type={monthly ? 'month' : 'date'} className="min-w-0 w-auto"
                  min={monthly ? today.slice(0, 7) : today} max={monthly ? lastDate?.slice(0, 7) : lastDate}
                  value={monthly ? currentDate.slice(0, 7) : currentDate}
                  onChange={event => {
                    const value = event.target.value
                    if (monthly ? MONTH_PATTERN.test(value) && isCalendarDate(value + '-01') : isCalendarDate(value)) {
                      changeDate(monthly ? value + '-01' : value)
                    }
                  }} />
                <Button variant="outline" size="icon" className="shrink-0" aria-label={monthly ? 'Mes siguiente' : 'Día siguiente'}
                  disabled={!canGoForward} onClick={() => changeDate(next)}><ChevronRight className="size-4" /></Button>
              </div>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Período de la agenda">
              <Button size="sm" variant={monthly ? 'outline' : 'default'} aria-pressed={!monthly} onClick={() => changePeriod('day')}>Día</Button>
              <Button size="sm" variant={monthly ? 'default' : 'outline'} aria-pressed={monthly} onClick={() => changePeriod('month')}>Mes</Button>
            </div>
          </div>

          {error ? (
            <div className="py-5 space-y-3" role="alert"><p className="text-sm">{error}</p>
              <Button size="sm" variant="outline" onClick={() => setRetryCount(count => count + 1)}>Reintentar</Button>
            </div>
          ) : !current ? (
            <div className="flex gap-2 items-center py-5 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />Cargando horarios...</div>
          ) : !activeDay ? (
            <p className="pt-5 text-sm text-muted-foreground">{booked ? 'No hay turnos agendados' : 'No hay horarios disponibles'} en este {monthly ? 'mes' : 'día'}.</p>
          ) : (
            <>
              {monthly && (
                <div className="pt-4 space-y-2">
                  <h2 className="text-sm font-semibold">Elegí una fecha</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {current.days.map(day => (
                      <Button key={day.date} size="sm" variant={day.date === activeDay.date ? 'default' : 'outline'}
                        className="capitalize" aria-pressed={day.date === activeDay.date} onClick={() => setSelected(day.date)}>
                        {formatCalendarDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-5" aria-live="polite">
                {monthly && <h2 className="text-sm font-semibold capitalize">{formatCalendarDate(activeDay.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>}
                <ul className={'grid gap-2 ' + (booked ? 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-5')}>
                  {activeDay.slots.map(slot => (
                    <li className="flex items-center justify-center gap-1.5 rounded-lg border bg-violet-50/70 px-2 py-2 text-sm font-medium tabular-nums dark:bg-slate-800"
                      key={slot.start + (slot.end || '')}><Clock className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                      <span>{slot.start}{slot.end && ' – ' + slot.end}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
