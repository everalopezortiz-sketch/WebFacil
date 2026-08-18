'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CalendarDays, LayoutGrid, Scissors, Tag, UserRound, Clock, CalendarX, Settings, ExternalLink, CheckCircle2, Circle, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import BookingOverview from './BookingOverview'
import WeeklyCalendar from './WeeklyCalendar'
import ServicesManager from './ServicesManager'
import ServiceCategoriesManager from './ServiceCategoriesManager'
import StaffManager from './StaffManager'
import AvailabilityEditor from './AvailabilityEditor'
import TimeOffManager from './TimeOffManager'
import BookingSettings from './BookingSettings'

export default function BookingManager({ supabase, profile }) {
  const [sub, setSub] = useState('agenda')
  const [data, setData] = useState({ settings: null, categories: [], services: [], staff: [], staffServices: [], availability: [], timeOff: [], appts: [] })
  const [loading, setLoading] = useState(true)
  // Build public links from the browser origin (never rely on NEXT_PUBLIC_BASE_URL)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const storeUrl = `${origin}/s/${profile.slug}`
  const reservaUrl = `${storeUrl}/r`

  const copyLink = async (url, label) => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent || '')) {
        await navigator.share({ title: 'Mi web', url }); return
      }
    } catch (e) { if (e && e.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(url); toast.success(`${label} copiado`) }
    catch {
      try {
        const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast.success(`${label} copiado`)
      } catch { toast.error('No se pudo copiar el enlace') }
    }
  }

  const loadAll = useCallback(async () => {
    const get = async (url) => { const r = await authFetch(supabase, url); return r.ok ? r.json() : [] }
    // Overview appointments: wide window (past 30d -> next 60d)
    const start = new Date(); start.setDate(start.getDate() - 30)
    const end = new Date(); end.setDate(end.getDate() + 60)
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
    const [settings, categories, services, staff, staffServices, availability, timeOff, appts] = await Promise.all([
      get('/api/booking/settings'), get('/api/booking/service-categories'), get('/api/booking/services'),
      get('/api/booking/staff'), get('/api/booking/staff-services'), get('/api/booking/availability'),
      get('/api/booking/time-off'), get(`/api/booking/appointments?${params}`)
    ])
    setData({ settings, categories, services, staff, staffServices, availability, timeOff, appts })
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAll() }, [loadAll])

  const needsSetup = !loading && (data.services.length === 0 || data.availability.length === 0 || data.staffServices.length === 0)

  const wizardSteps = [
    { done: data.categories.length > 0, label: 'Crear una categoría de servicios', tab: 'categorias' },
    { done: data.services.length > 0, label: 'Crear tu primer servicio (precio y duración)', tab: 'servicios' },
    { done: data.staff.length > 0, label: 'Tener un profesional', tab: 'profesionales' },
    { done: data.staffServices.length > 0, label: 'Asignar servicios al profesional', tab: 'profesionales' },
    { done: data.availability.length > 0, label: 'Definir horarios de atención', tab: 'horarios' },
  ]

  const tabBtn = 'gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md'

  return (
    <div className="space-y-4">
      {needsSetup && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-lg">Configura tu agenda</h3>
                <p className="text-sm text-muted-foreground">Completa estos pasos para empezar a recibir reservas.</p>
              </div>
              <a href={storeUrl} target="_blank" rel="noreferrer"><Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" />Ver mi web</Button></a>
            </div>
            <div className="space-y-2">
              {wizardSteps.map((s, i) => (
                <button key={i} onClick={() => setSub(s.tab)} className="w-full flex items-center gap-3 text-left p-2 rounded-md hover:bg-white/60 transition">
                  {s.done ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                  <span className={s.done ? 'line-through text-muted-foreground' : ''}>{s.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={storeUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-2"><ExternalLink className="w-4 h-4" />Ver web</Button></a>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => copyLink(storeUrl, 'Enlace de la web')}><Copy className="w-4 h-4" />Copiar web</Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => copyLink(reservaUrl, 'Enlace de reservas')}><Link2 className="w-4 h-4" />Copiar enlace de reservas</Button>
      </div>

      <Tabs value={sub} onValueChange={setSub}>
        <TabsList className="flex-wrap h-auto gap-1 bg-white/60 backdrop-blur p-1.5 shadow-sm">
          <TabsTrigger value="agenda" className={tabBtn}><CalendarDays className="w-4 h-4" />Agenda</TabsTrigger>
          <TabsTrigger value="resumen" className={tabBtn}><LayoutGrid className="w-4 h-4" />Resumen</TabsTrigger>
          <TabsTrigger value="servicios" className={tabBtn}><Scissors className="w-4 h-4" />Servicios</TabsTrigger>
          <TabsTrigger value="categorias" className={tabBtn}><Tag className="w-4 h-4" />Categorías</TabsTrigger>
          <TabsTrigger value="profesionales" className={tabBtn}><UserRound className="w-4 h-4" />Profesionales</TabsTrigger>
          <TabsTrigger value="horarios" className={tabBtn}><Clock className="w-4 h-4" />Horarios</TabsTrigger>
          <TabsTrigger value="bloqueos" className={tabBtn}><CalendarX className="w-4 h-4" />Bloqueos</TabsTrigger>
          <TabsTrigger value="config" className={tabBtn}><Settings className="w-4 h-4" />Configuración</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="agenda"><WeeklyCalendar supabase={supabase} profile={profile} staff={data.staff} services={data.services} staffServices={data.staffServices} onDataChange={loadAll} /></TabsContent>
          <TabsContent value="resumen"><BookingOverview appts={data.appts} staff={data.staff} /></TabsContent>
          <TabsContent value="servicios"><ServicesManager supabase={supabase} services={data.services} categories={data.categories} onReload={loadAll} /></TabsContent>
          <TabsContent value="categorias"><ServiceCategoriesManager supabase={supabase} categories={data.categories} onReload={loadAll} /></TabsContent>
          <TabsContent value="profesionales"><StaffManager supabase={supabase} staff={data.staff} services={data.services} staffServices={data.staffServices} onReload={loadAll} /></TabsContent>
          <TabsContent value="horarios"><AvailabilityEditor supabase={supabase} staff={data.staff} availability={data.availability} onReload={loadAll} /></TabsContent>
          <TabsContent value="bloqueos"><TimeOffManager supabase={supabase} staff={data.staff} timeOff={data.timeOff} onReload={loadAll} /></TabsContent>
          <TabsContent value="config"><BookingSettings supabase={supabase} settings={data.settings} onReload={loadAll} /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
