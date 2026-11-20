'use client'

import { useState } from 'react'
import { Copy, ExternalLink, Link2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bookingDate, isCalendarDate, MONTH_PATTERN } from '@/lib/booking/dates'

const views = [
  { key: 'available', title: 'Horarios disponibles', description: 'Fechas y horas con disponibilidad para reservar.' },
  { key: 'booked', title: 'Turnos agendados', description: 'Franjas reservadas sin nombres ni datos de clientes.' },
]

export default function AgendaShareDialog({ slug, timezone }) {
  const [period, setPeriod] = useState('day')
  const [date, setDate] = useState('')
  const today = bookingDate(new Date(), timezone)
  const value = date || today
  const linkDate = period === 'month' ? value.slice(0, 7) + '-01' : value
  const valid = isCalendarDate(linkDate)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const urlFor = (view) => origin + '/s/' + encodeURIComponent(slug) + '/agenda?' + new URLSearchParams({ view, period, date: linkDate })

  const copy = async (view) => {
    try {
      await navigator.clipboard.writeText(urlFor(view))
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar. Abrí el enlace para copiar la dirección.')
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" className="gap-2"><Link2 className="size-4" />Compartir agenda</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compartir agenda</DialogTitle>
          <DialogDescription>Elegí el día o mes que querés compartir con tus clientes.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2">
          <div><Label htmlFor="agenda-share-period">Vista</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger id="agenda-share-period"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="day">Día</SelectItem><SelectItem value="month">Mes</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="agenda-share-date">{period === 'month' ? 'Mes' : 'Fecha'}</Label>
            <Input id="agenda-share-date" type={period === 'month' ? 'month' : 'date'}
              min={period === 'month' ? today.slice(0, 7) : today}
              value={period === 'month' ? value.slice(0, 7) : value}
              onChange={e => {
                const next = e.target.value
                if (period === 'month' && MONTH_PATTERN.test(next)) setDate(next === today.slice(0, 7) ? today : next + '-01')
                if (period === 'day' && isCalendarDate(next)) setDate(next)
              }}
            />
          </div>
        </div>
        {views.map(view => (
          <div key={view.key} className="rounded-lg border p-3 space-y-2.5">
            <div>
              <h3 className="text-sm font-semibold">{view.title}</h3>
              <p className="text-sm text-muted-foreground">{view.description}</p>
            </div>
            {valid && (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={urlFor(view.key)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Ver</a>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(view.key)}><Copy className="size-4" />Copiar enlace</Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={'https://wa.me/?text=' + encodeURIComponent(view.title + '\n' + urlFor(view.key))}
                    target="_blank" rel="noreferrer"><MessageCircle className="size-4" />WhatsApp</a>
                </Button>
              </div>
            )}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}
