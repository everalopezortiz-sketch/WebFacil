'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, DollarSign, Scissors, Clock, Wallet } from 'lucide-react'

const PM_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mixed: 'Mixto', other: 'Otro' }
const ymd = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
const fmtDT = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return iso } }

export default function ServicesReport({ supabase, formatPrice }) {
  const today = ymd(new Date())
  const [range, setRange] = useState({ from: today, to: today })
  const [loading, setLoading] = useState(false)
  const [dash, setDash] = useState(null)
  const [sales, setSales] = useState([])

  const load = useCallback(async (r) => {
    const rng = r || range
    setLoading(true)
    try {
      const p = new URLSearchParams({ from: rng.from, to: rng.to })
      const [dR, sR] = await Promise.all([
        authFetch(supabase, `/api/booking/finance/dashboard?${p}`),
        authFetch(supabase, `/api/booking/service-sales?from=${rng.from}&to=${rng.to}&limit=50`),
      ])
      setDash(dR.ok ? await dR.json() : null)
      const sd = sR.ok ? await sR.json() : { items: [] }
      setSales(sd.items || [])
    } catch { /* noop */ }
    setLoading(false)
  }, [supabase, range])

  useEffect(() => { load() /* initial */ }, []) // eslint-disable-line

  const preset = (key) => {
    const now = new Date()
    let from, to
    if (key === 'today') { from = ymd(now); to = ymd(now) }
    else if (key === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); from = ymd(s); to = ymd(now) }
    else if (key === 'month') { from = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); to = ymd(now) }
    else if (key === 'lastMonth') { from = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }
    const rng = { from, to }; setRange(rng); load(rng)
  }

  const pm = dash?.servicePaymentMethods || {}

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>Reporte de servicios</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-auto" />
            <span>a</span>
            <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-auto" />
            <Button onClick={() => load()}>Generar</Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Button size="sm" variant="outline" onClick={() => preset('today')}>Hoy</Button>
          <Button size="sm" variant="outline" onClick={() => preset('week')}>Últimos 7 días</Button>
          <Button size="sm" variant="outline" onClick={() => preset('month')}>Este mes</Button>
          <Button size="sm" variant="outline" onClick={() => preset('lastMonth')}>Mes anterior</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0"><CardContent className="p-4"><div className="flex items-center gap-2 opacity-90 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs">Ingresos cobrados</span></div><p className="text-2xl font-extrabold">{formatPrice(dash?.serviceRevenue || 0)}</p><p className="text-xs opacity-80 mt-1">{dash?.paidServiceSalesCount || 0} cobro(s)</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0"><CardContent className="p-4"><div className="flex items-center gap-2 opacity-90 mb-1"><Clock className="w-4 h-4" /><span className="text-xs">Cobros pendientes</span></div><p className="text-2xl font-extrabold">{formatPrice(dash?.pendingServiceCollection || 0)}</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-sky-500 to-blue-600 text-white border-0"><CardContent className="p-4"><div className="flex items-center gap-2 opacity-90 mb-1"><Scissors className="w-4 h-4" /><span className="text-xs">Servicios realizados</span></div><p className="text-3xl font-extrabold">{dash?.servicesPerformedCount || 0}</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white border-0"><CardContent className="p-4"><div className="flex items-center gap-2 opacity-90 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs">Comisiones generadas</span></div><p className="text-2xl font-extrabold">{formatPrice(dash?.commissionsGenerated || 0)}</p></CardContent></Card>
            </div>

            {Object.keys(pm).length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-sm">Cobros por forma de pago</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pm).map(([k, v]) => <Badge key={k} variant="outline" className="text-sm py-1">{PM_LABELS[k] || k}: {formatPrice(v)}</Badge>)}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-3 text-sm">Cobros del período</h3>
              {sales.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sin cobros en este período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">N°</th><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Cliente</th><th className="py-2 px-3">Servicios</th><th className="py-2 px-3 text-right">Total</th><th className="py-2 px-3">Estado</th></tr></thead>
                    <tbody>
                      {sales.map(s => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 px-3 font-medium whitespace-nowrap">{s.sale_number}</td>
                          <td className="py-2 px-3 whitespace-nowrap">{fmtDT(s.completed_at)}</td>
                          <td className="py-2 px-3">{s.customer_name || '-'}</td>
                          <td className="py-2 px-3">{(s.booking_service_sale_items || []).map(it => it.service_name_snapshot).join(', ')}</td>
                          <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{formatPrice(s.total_amount)}</td>
                          <td className="py-2 px-3">{s.payment_status === 'paid' ? <Badge className="bg-green-100 text-green-800 border-green-300">Cobrado</Badge> : <Badge variant="outline" className="text-amber-700 border-amber-300">Pendiente</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">"Servicio realizado" cuenta el trabajo hecho; "Ingreso cobrado" solo suma cuando el servicio fue pagado.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
