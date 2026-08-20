'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/booking/client'
import StaffManager from './StaffManager'
import { downloadSettlementPdf, printSettlementPdf } from './SettlementReceipt'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Users, TrendingUp, Wallet, ReceiptText, Loader2, Plus, Pencil, Trash2, FileDown, Printer, Eye } from 'lucide-react'
import { toast } from 'sonner'

const PM_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mixed: 'Mixto', other: 'Otro' }
const ADV_STATUS = { pending: 'Pendiente', partial: 'Aplicado parcialmente', applied: 'Aplicado', voided: 'Anulado' }
const ymd = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
const fmtD = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d } }
const fmtDate = (d) => { if (!d) return ''; try { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}` } catch { return d } }

export default function PersonnelManager({ supabase, profile, settings, active = true, currencySymbol = 'Gs', currency = 'PYG' }) {
  const [tab, setTab] = useState('personal')
  const [loaded, setLoaded] = useState(false)
  const [base, setBase] = useState({ staff: [], services: [], categories: [], staffServices: [] })
  const money = (v) => `${currencySymbol} ${Math.round(Number(v || 0)).toLocaleString('es-PY')}`
  const branding = {
    business_name: settings?.store_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Negocio',
    logo_url: settings?.logo_url || null, phone: settings?.whatsapp_number || null, address: settings?.location_link || null,
  }

  const loadBase = useCallback(async () => {
    const get = async (url) => { const r = await authFetch(supabase, url); return r.ok ? r.json() : [] }
    const [staff, services, categories, staffServices] = await Promise.all([
      get('/api/booking/staff'), get('/api/booking/services'), get('/api/booking/service-categories'), get('/api/booking/staff-services'),
    ])
    setBase({ staff, services, categories, staffServices })
    setLoaded(true)
  }, [supabase])

  useEffect(() => { if (active && !loaded) loadBase() }, [active, loaded, loadBase])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Personal</h2>
        <p className="text-sm text-muted-foreground">Gestioná el equipo, sus ganancias, adelantos y pagos.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-white/60 backdrop-blur p-1.5 shadow-sm overflow-x-auto">
          <TabsTrigger value="personal" className="gap-2"><Users className="w-4 h-4" />Personal</TabsTrigger>
          <TabsTrigger value="ganancias" className="gap-2"><TrendingUp className="w-4 h-4" />Ganancias</TabsTrigger>
          <TabsTrigger value="adelantos" className="gap-2"><Wallet className="w-4 h-4" />Adelantos</TabsTrigger>
          <TabsTrigger value="historial" className="gap-2"><ReceiptText className="w-4 h-4" />Historial de pagos</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          {!loaded ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando...</div>
          ) : (
            <>
              <TabsContent value="personal">
                <StaffManager supabase={supabase} staff={base.staff} services={base.services} staffServices={base.staffServices} categories={base.categories} onReload={loadBase} currencySymbol={currencySymbol} />
              </TabsContent>
              <TabsContent value="ganancias"><EarningsTab supabase={supabase} staff={base.staff} money={money} branding={branding} currency={currency} /></TabsContent>
              <TabsContent value="adelantos"><AdvancesTab supabase={supabase} staff={base.staff} money={money} /></TabsContent>
              <TabsContent value="historial"><SettlementsTab supabase={supabase} staff={base.staff} money={money} branding={branding} currency={currency} /></TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}

// ---------- GANANCIAS ----------
function defaultPeriod(freq) {
  const now = new Date()
  if (freq === 'weekly') {
    const day = now.getDay() === 0 ? 7 : now.getDay()
    const start = new Date(now); start.setDate(now.getDate() - (day - 1))
    return { start: ymd(start), end: ymd(now) }
  }
  return { start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), end: ymd(now) }
}

function EarningsTab({ supabase, staff, money, branding, currency }) {
  const [staffId, setStaffId] = useState('')
  const [period, setPeriod] = useState(defaultPeriod('monthly'))
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState([])
  const [summary, setSummary] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payForm, setPayForm] = useState({ payment_method: 'cash', notes: '' })

  const selected = staff.find(s => s.id === staffId)
  const activeStaff = staff.filter(s => s.is_active !== false)

  const onSelectStaff = (id) => {
    setStaffId(id)
    const s = staff.find(x => x.id === id)
    setPeriod(defaultPeriod(s?.pay_frequency || 'monthly'))
    setLines([]); setSummary(null)
  }

  const load = useCallback(async () => {
    if (!staffId) { toast.error('Elegí una persona'); return }
    setLoading(true)
    try {
      const p = new URLSearchParams({ from: period.start, to: period.end })
      const [sumR, earnR] = await Promise.all([
        authFetch(supabase, `/api/booking/finance/staff-summary?${p}`),
        authFetch(supabase, `/api/booking/staff-earnings?staff_id=${staffId}&from=${period.start}&to=${period.end}&limit=100`),
      ])
      const sums = sumR.ok ? await sumR.json() : []
      const earn = earnR.ok ? await earnR.json() : { items: [] }
      const row = (Array.isArray(sums) ? sums : []).find(x => x.staffId === staffId || x.staff_id === staffId) || null
      setSummary(row)
      setLines(earn.items || [])
    } catch { toast.error('No se pudieron cargar las ganancias') }
    setLoading(false)
  }, [supabase, staffId, period])

  const pendingLines = lines.filter(l => l.settlement_status === 'pending')
  const commissionPending = pendingLines.reduce((s, l) => s + Number(l.commission_amount || 0), 0)
  const totalSold = lines.reduce((s, l) => s + Number(l.net_amount || 0), 0)
  const commissionGenerated = lines.reduce((s, l) => s + Number(l.commission_amount || 0), 0)
  const compType = selected?.compensation_type || 'commission'
  const salaryPeriod = (compType === 'salary' || compType === 'mixed') ? Number(selected?.salary_amount || 0) : 0
  const advancesRemaining = Number(summary?.advancesRemaining ?? summary?.advances_remaining ?? 0)
  const bruto = salaryPeriod + commissionPending
  const advancesApplied = Math.min(advancesRemaining, bruto)
  const totalToPay = Math.max(0, bruto - advancesApplied)

  const doPay = async () => {
    if (!PM_ok(payForm.payment_method)) { toast.error('Seleccioná la forma de pago'); return }
    setPaying(true)
    try {
      const res = await authFetch(supabase, '/api/booking/staff-settlements', {
        method: 'POST',
        body: JSON.stringify({ staff_id: staffId, period_start: period.start, period_end: period.end, payment_method: payForm.payment_method, notes: payForm.notes || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'No se pudo procesar el pago'); setPaying(false); return }
      const paid = data.totalPaid ?? data.net_paid ?? totalToPay
      toast.success(`Pago registrado: ${money(paid)} (${data.settlementNumber || 'liquidación'})`)
      setPayOpen(false); setPayForm({ payment_method: 'cash', notes: '' })
      await load()
    } catch { toast.error('Error al procesar el pago') }
    setPaying(false)
  }

  const pdfBundle = (mode) => ({
    mode, currency, branding, staff: { name: selected?.name, job_title: selected?.job_title },
    lines: pendingLines, baseSalary: salaryPeriod, commissionTotal: commissionPending,
    advancesTotal: advancesApplied, netPaid: totalToPay, periodStart: period.start, periodEnd: period.end,
    paymentMethod: payForm.payment_method,
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Personal</Label>
            <Select value={staffId} onValueChange={onSelectStaff}>
              <SelectTrigger><SelectValue placeholder="Elegí una persona" /></SelectTrigger>
              <SelectContent>{activeStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Desde</Label><Input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></div>
          <Button onClick={load} disabled={loading || !staffId}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Calcular</Button>
        </CardContent>
      </Card>

      {summary !== null || lines.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatMini label="Servicios realizados" value={String(pendingLines.length + (lines.length - pendingLines.length))} sub={`${lines.length} en el período`} />
            <StatMini label="Total vendido" value={money(totalSold)} />
            <StatMini label="Comisión generada" value={money(commissionGenerated)} />
            <StatMini label="Comisión pendiente" value={money(commissionPending)} highlight />
            <StatMini label="Sueldo fijo del período" value={money(salaryPeriod)} />
            <StatMini label="Adelantos pendientes" value={money(advancesRemaining)} />
            <StatMini label="Total estimado a pagar" value={money(totalToPay)} highlight />
          </div>
          <p className="text-xs text-muted-foreground">Cálculo: sueldo fijo + comisiones pendientes − adelantos. El monto final lo confirma el sistema al pagar.</p>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Servicios pendientes de liquidar ({pendingLines.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Cliente</th><th className="py-2 px-3">Servicio</th><th className="py-2 px-3 text-right">Base</th><th className="py-2 px-3 text-right">%</th><th className="py-2 px-3 text-right">Comisión</th></tr></thead>
                  <tbody>
                    {pendingLines.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No hay comisiones pendientes en el período.</td></tr>
                    ) : pendingLines.map(l => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-2 px-3 whitespace-nowrap">{fmtD(l.completed_at)}</td>
                        <td className="py-2 px-3">{l.customer_name || '-'}</td>
                        <td className="py-2 px-3">{l.service_name}</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">{money(l.net_amount)}</td>
                        <td className="py-2 px-3 text-right">{Number(l.commission_percent || 0)}%</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{money(l.commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => setPayOpen(true)} disabled={totalToPay <= 0 && commissionPending <= 0 && salaryPeriod <= 0} className="gap-2"><Wallet className="w-4 h-4" />Pagar pendiente</Button>
          </div>
        </>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Elegí una persona y un período, luego tocá "Calcular".</CardContent></Card>
      )}

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pagar pendiente — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Período: {fmtDate(period.start)} al {fmtDate(period.end)}</div>
            <div className="rounded-md border divide-y text-sm">
              <Row label="Servicios incluidos" value={String(pendingLines.length)} />
              <Row label="Comisiones" value={money(commissionPending)} />
              <Row label="Sueldo fijo" value={money(salaryPeriod)} />
              <Row label="Adelantos a descontar" value={`- ${money(advancesApplied)}`} />
              <Row label="Total a pagar" value={money(totalToPay)} bold />
            </div>
            <div>
              <Label className="text-xs">Forma de pago</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PM_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Observación</Label><Textarea rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadSettlementPdf(pdfBundle('pending'))}><FileDown className="w-4 h-4" />Descargar previsualización PDF</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={doPay} disabled={paying}>{paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const PM_ok = (m) => ['cash', 'transfer', 'card', 'mixed', 'other'].includes(m)
function StatMini({ label, value, sub, highlight }) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}
function Row({ label, value, bold }) {
  return <div className={`flex items-center justify-between px-3 py-2 ${bold ? 'font-bold text-base' : ''}`}><span className={bold ? '' : 'text-muted-foreground'}>{label}</span><span>{value}</span></div>
}

// ---------- ADELANTOS ----------
function AdvancesTab({ supabase, staff, money }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState('all')
  const [dialog, setDialog] = useState({ open: false, edit: null })
  const [form, setForm] = useState({ staff_id: '', amount: '', advance_date: ymd(new Date()), payment_method: 'cash', notes: '' })
  const [saving, setSaving] = useState(false)
  const activeStaff = staff.filter(s => s.is_active !== false)
  const staffName = (id) => staff.find(s => s.id === id)?.name || '-'

  const load = useCallback(async () => {
    setLoading(true)
    const q = filterStaff !== 'all' ? `?staff_id=${filterStaff}` : ''
    const r = await authFetch(supabase, `/api/booking/staff-advances${q}`)
    const d = r.ok ? await r.json() : { items: [] }
    setItems(d.items || [])
    setLoading(false)
  }, [supabase, filterStaff])
  useEffect(() => { load() }, [load])

  const openNew = () => { setForm({ staff_id: '', amount: '', advance_date: ymd(new Date()), payment_method: 'cash', notes: '' }); setDialog({ open: true, edit: null }) }
  const openEdit = (a) => { setForm({ staff_id: a.staff_id, amount: String(a.amount), advance_date: a.advance_date, payment_method: a.payment_method || 'cash', notes: a.notes || '' }); setDialog({ open: true, edit: a }) }

  const save = async () => {
    if (!form.staff_id) { toast.error('Elegí la persona'); return }
    if (!(Number(form.amount) > 0)) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    const edit = dialog.edit
    const url = edit ? `/api/booking/staff-advances/${edit.id}` : '/api/booking/staff-advances'
    const res = await authFetch(supabase, url, { method: edit ? 'PUT' : 'POST', body: JSON.stringify({ ...form, amount: Number(form.amount) }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(d.error || 'No se pudo guardar'); return }
    toast.success('Adelanto guardado'); setDialog({ open: false, edit: null }); load()
  }

  const del = async (a) => {
    if (!confirm('¿Eliminar este adelanto? Esta acción no se puede deshacer.')) return
    const res = await authFetch(supabase, `/api/booking/staff-advances/${a.id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error || 'No se pudo eliminar'); return }
    toast.success('Adelanto eliminado'); load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="w-48">
          <Select value={filterStaff} onValueChange={setFilterStaff}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todo el personal</SelectItem>{activeStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Nuevo adelanto</Button>
      </div>

      {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin adelantos registrados.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Personal</th><th className="py-2 px-3 text-right">Monto</th><th className="py-2 px-3 text-right">Aplicado</th><th className="py-2 px-3 text-right">Saldo</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {items.map(a => {
                const saldo = Number(a.amount || 0) - Number(a.applied_amount || 0)
                const editable = Number(a.applied_amount || 0) === 0 && a.status === 'pending'
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(a.advance_date)}</td>
                    <td className="py-2 px-3">{staffName(a.staff_id)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">{money(a.amount)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">{money(a.applied_amount)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{money(saldo)}</td>
                    <td className="py-2 px-3"><Badge variant="outline">{ADV_STATUS[a.status] || a.status}</Badge></td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!editable} onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" disabled={!editable} onClick={() => del(a)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, edit: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.edit ? 'Editar' : 'Nuevo'} adelanto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Personal</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })} disabled={!!dialog.edit}>
                <SelectTrigger><SelectValue placeholder="Elegí una persona" /></SelectTrigger>
                <SelectContent>{activeStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Monto</Label><Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label className="text-xs">Fecha</Label><Input type="date" value={form.advance_date} onChange={(e) => setForm({ ...form, advance_date: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">Forma de entrega</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['cash', 'transfer', 'card', 'other'].map(k => <SelectItem key={k} value={k}>{PM_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Nota</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, edit: null })}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- HISTORIAL DE PAGOS ----------
function SettlementsTab({ supabase, staff, money, branding, currency }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStaff, setFilterStaff] = useState('all')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const staffName = (id) => staff.find(s => s.id === id)?.name || '-'

  const load = useCallback(async () => {
    setLoading(true)
    const q = filterStaff !== 'all' ? `?staff_id=${filterStaff}` : ''
    const r = await authFetch(supabase, `/api/booking/staff-settlements${q}`)
    const d = r.ok ? await r.json() : { items: [] }
    setItems(d.items || [])
    setLoading(false)
  }, [supabase, filterStaff])
  useEffect(() => { load() }, [load])

  const openDetail = async (s) => {
    setDetailLoading(true); setDetail({ loading: true })
    const r = await authFetch(supabase, `/api/booking/staff-settlements/${s.id}`)
    const d = r.ok ? await r.json() : null
    setDetail(d); setDetailLoading(false)
  }

  const bundleFromDetail = (d) => ({
    mode: 'final', currency, branding,
    staff: { name: d.staff?.name, job_title: d.staff?.job_title },
    lines: d.lines || [], baseSalary: d.settlement?.base_salary_amount, commissionTotal: d.settlement?.commission_total,
    advancesTotal: d.settlement?.advances_total, netPaid: d.settlement?.net_paid,
    periodStart: d.settlement?.period_start, periodEnd: d.settlement?.period_end,
    settlementNumber: d.settlement?.settlement_number, paymentMethod: d.settlement?.payment_method, paidAt: d.settlement?.paid_at, notes: d.settlement?.notes,
  })

  return (
    <div className="space-y-4">
      <div className="w-48">
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todo el personal</SelectItem>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin pagos registrados.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between"><span className="font-semibold text-sm">{s.settlement_number}</span><Badge variant="outline">{fmtDate(s.paid_at || s.created_at)}</Badge></div>
                <p className="text-sm">{staffName(s.staff_id)}</p>
                <p className="text-xs text-muted-foreground">Período: {fmtDate(s.period_start)} al {fmtDate(s.period_end)}</p>
                <div className="text-xs text-muted-foreground">Comisiones {money(s.commission_total)} · Sueldo {money(s.base_salary_amount)} · Adelantos -{money(s.advances_total)}</div>
                <p className="font-bold text-primary">{money(s.net_paid)} <span className="text-xs font-normal text-muted-foreground">({PM_LABELS[s.payment_method] || s.payment_method})</span></p>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => openDetail(s)}><Eye className="w-3.5 h-3.5" />Detalle</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Detalle de liquidación</DialogTitle></DialogHeader>
          {detailLoading || detail?.loading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : detail ? (
            <div className="space-y-3">
              <div className="text-sm"><span className="font-semibold">{detail.staff?.name}</span>{detail.staff?.job_title ? ` — ${detail.staff.job_title}` : ''}</div>
              <div className="text-xs text-muted-foreground">{detail.settlement?.settlement_number} · Período {fmtDate(detail.settlement?.period_start)} al {fmtDate(detail.settlement?.period_end)} · Pagado {fmtD(detail.settlement?.paid_at)}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-1.5 px-2">Fecha</th><th className="py-1.5 px-2">Cliente</th><th className="py-1.5 px-2">Servicio</th><th className="py-1.5 px-2 text-right">Base</th><th className="py-1.5 px-2 text-right">%</th><th className="py-1.5 px-2 text-right">Comisión</th></tr></thead>
                  <tbody>
                    {(detail.lines || []).map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 px-2 whitespace-nowrap">{fmtD(l.completed_at)}</td>
                        <td className="py-1.5 px-2">{l.customer_name || '-'}</td>
                        <td className="py-1.5 px-2">{l.service_name}</td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap">{money(l.net_amount)}</td>
                        <td className="py-1.5 px-2 text-right">{Number(l.commission_percent || 0)}%</td>
                        <td className="py-1.5 px-2 text-right whitespace-nowrap">{money(l.commission_amount)}</td>
                      </tr>
                    ))}
                    {(detail.lines || []).length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Sin servicios.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="rounded-md border divide-y text-sm">
                <Row label="Sueldo fijo" value={money(detail.settlement?.base_salary_amount)} />
                <Row label="Comisiones" value={money(detail.settlement?.commission_total)} />
                <Row label="Adelantos descontados" value={`- ${money(detail.settlement?.advances_total)}`} />
                <Row label="Total pagado" value={money(detail.settlement?.net_paid)} bold />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadSettlementPdf(bundleFromDetail(detail))}><FileDown className="w-4 h-4" />PDF</Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => printSettlementPdf(bundleFromDetail(detail))}><Printer className="w-4 h-4" />Imprimir</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
