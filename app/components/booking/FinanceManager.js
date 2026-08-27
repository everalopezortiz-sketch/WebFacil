'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart,
} from 'recharts'
import { Loader2, Plus, Ban, Wallet, RefreshCw, Zap, Tag, Pencil, TrendingUp, Search, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const PM_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mixed: 'Mixto', other: 'Otro' }
const PM_KEYS = ['cash', 'transfer', 'card', 'mixed', 'other']
const INCOME_COLOR = '#16a34a'
const EXPENSE_COLOR = '#dc2626'
const BALANCE_COLOR = '#2563eb'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}` }

function computeRange(kind) {
  const now = new Date()
  if (kind === 'today') return { from: ymd(now), to: ymd(now) }
  if (kind === 'week') {
    const day = now.getDay() === 0 ? 7 : now.getDay()
    const start = new Date(now); start.setDate(now.getDate() - (day - 1))
    return { from: ymd(start), to: ymd(now) }
  }
  if (kind === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: ymd(first), to: ymd(last) }
  }
  // month (default)
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) }
}

export default function FinanceManager({ supabase, profile, currencySymbol = 'Gs', currency = 'PYG' }) {
  const money = useCallback((v) => {
    const n = Math.round(Number(v || 0))
    return `${n < 0 ? '-' : ''}${currencySymbol} ${Math.abs(n).toLocaleString('es-PY')}`
  }, [currencySymbol])

  const [setup, setSetup] = useState(null)
  const [setupLoading, setSetupLoading] = useState(true)
  const [periodKind, setPeriodKind] = useState('month')
  const [range, setRange] = useState(() => computeRange('month'))
  const [custom, setCustom] = useState(() => computeRange('month'))
  const [overview, setOverview] = useState(null)
  const [ovLoading, setOvLoading] = useState(true)
  const [ovError, setOvError] = useState(false)
  const [subtab, setSubtab] = useState('resumen')
  const ovAbort = useRef(null)

  // ----- SETUP: once -----
  const loadSetup = useCallback(async () => {
    setSetupLoading(true)
    try {
      const r = await authFetch(supabase, '/api/booking/finance/setup')
      const d = r.ok ? await r.json() : { categories: [], templates: [] }
      setSetup(d)
    } catch { setSetup({ categories: [], templates: [] }) }
    finally { setSetupLoading(false) }
  }, [supabase])
  useEffect(() => { loadSetup() }, [loadSetup])

  // ----- OVERVIEW: on range change (single call, abort previous) -----
  const loadOverview = useCallback(async (r) => {
    if (ovAbort.current) ovAbort.current.abort()
    const ctrl = new AbortController()
    ovAbort.current = ctrl
    setOvLoading(true); setOvError(false)
    try {
      const res = await authFetch(supabase, `/api/booking/finance/overview?from=${r.from}&to=${r.to}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (!res.ok) { setOvError(true); return }
      const d = await res.json()
      if (ctrl.signal.aborted) return
      setOverview(d)
    } catch (e) { if (e?.name !== 'AbortError') setOvError(true) }
    finally { if (!ctrl.signal.aborted) setOvLoading(false) }
  }, [supabase])
  useEffect(() => { loadOverview(range) }, [range, loadOverview])

  const selectPeriod = (kind) => {
    setPeriodKind(kind)
    if (kind !== 'custom') setRange(computeRange(kind))
  }
  const applyCustom = () => {
    if (!custom.from || !custom.to) { toast.error('Elegí ambas fechas'); return }
    if (custom.to < custom.from) { toast.error('La fecha "hasta" no puede ser anterior a "desde"'); return }
    setRange({ from: custom.from, to: custom.to })
  }

  const reloadAll = useCallback(() => { loadOverview(range) }, [loadOverview, range])

  if (setupLoading) {
    return <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando Finanzas...</div>
  }

  const PERIODS = [
    { k: 'today', label: 'Hoy' }, { k: 'week', label: 'Esta semana' },
    { k: 'month', label: 'Este mes' }, { k: 'lastMonth', label: 'Mes anterior' }, { k: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2"><Wallet className="w-5 h-5 text-violet-600" />Finanzas</h2>
        <p className="text-sm text-muted-foreground">Ingresos, gastos, ganancia y gastos frecuentes de tu negocio.</p>
      </div>

      {/* Period filters */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(p => (
              <Button key={p.k} size="sm" variant={periodKind === p.k ? 'default' : 'outline'} className={periodKind === p.k ? 'gradient-brand text-white' : ''} onClick={() => selectPeriod(p.k)}>{p.label}</Button>
            ))}
          </div>
          {periodKind === 'custom' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div><Label className="text-xs">Desde</Label><Input type="date" className="h-9" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} /></div>
              <div><Label className="text-xs">Hasta</Label><Input type="date" className="h-9" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} /></div>
              <Button size="sm" onClick={applyCustom}>Aplicar</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Período: {fmtDate(range.from)} al {fmtDate(range.to)}</p>
          )}
        </CardContent>
      </Card>

      <Tabs value={subtab} onValueChange={setSubtab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-white/60 backdrop-blur p-1.5 shadow-sm overflow-x-auto">
          <TabsTrigger value="resumen" className="gap-2"><TrendingUp className="w-4 h-4" />Resumen</TabsTrigger>
          <TabsTrigger value="gastos" className="gap-2"><Wallet className="w-4 h-4" />Gastos</TabsTrigger>
          <TabsTrigger value="frecuentes" className="gap-2"><Zap className="w-4 h-4" />Gastos frecuentes</TabsTrigger>
          <TabsTrigger value="categorias" className="gap-2"><Tag className="w-4 h-4" />Categorías</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="resumen">
            <SummaryTab overview={overview} loading={ovLoading} error={ovError} money={money} onRetry={reloadAll} />
          </TabsContent>
          <TabsContent value="gastos">
            <ExpensesTab supabase={supabase} range={range} categories={setup?.categories || []} money={money} onChanged={reloadAll} />
          </TabsContent>
          <TabsContent value="frecuentes">
            <TemplatesTab supabase={supabase} setup={setup} money={money} reloadSetup={loadSetup} onChanged={reloadAll} />
          </TabsContent>
          <TabsContent value="categorias">
            <CategoriesTab supabase={supabase} categories={setup?.categories || []} reloadSetup={loadSetup} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

// ==================== RESUMEN ====================
function StatCard({ label, value, hint, tone }) {
  const toneCls = tone === 'danger' ? 'border-red-200 bg-red-50' : tone === 'good' ? 'border-green-200 bg-green-50' : tone === 'primary' ? 'border-violet-200 bg-violet-50' : ''
  const valCls = tone === 'danger' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : tone === 'primary' ? 'text-violet-700' : ''
  return (
    <Card className={toneCls}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${valCls}`}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, children, empty }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="pt-1">
        {empty ? <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Sin datos en este período.</div> : children}
      </CardContent>
    </Card>
  )
}

function SummaryTab({ overview, loading, error, money, onRetry }) {
  if (loading) return <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Calculando...</div>
  if (error) return (
    <Card><CardContent className="p-8 text-center space-y-3">
      <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
      <p className="text-sm text-muted-foreground">No se pudo cargar el resumen.</p>
      <Button variant="outline" onClick={onRetry} className="gap-1"><RefreshCw className="w-4 h-4" />Reintentar</Button>
    </CardContent></Card>
  )
  if (!overview) return null

  const o = overview
  const netTone = Number(o.netProfit || 0) < 0 ? 'danger' : 'good'
  const marginPct = `${Number(o.profitMargin || 0).toFixed(1)}%`
  const daily = (o.dailySeries || []).map(d => ({ ...d, dLabel: fmtDate(d.date).slice(0, 5) }))
  const dailyHasData = daily.some(d => (d.totalRevenue || 0) !== 0 || (d.expenses || 0) !== 0)
  const cats = (o.expensesByCategory || []).filter(c => Number(c.amount || 0) > 0)
  const bySource = (o.incomeBySource || []).map(s => ({ ...s, amount: Number(s.amount || 0) }))
  const sourceHasData = bySource.some(s => s.amount > 0)
  const tip = (v) => money(v)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Ingresos totales" value={money(o.totalRevenue)} tone="good" />
        <StatCard label="Ingresos por servicios" value={money(o.serviceRevenue)} />
        <StatCard label="Ingresos por productos" value={money(o.productRevenue)} />
        <StatCard label="Cobros de servicios pendientes" value={money(o.pendingServiceCollection)} hint="Aún no cobrados" />
        <StatCard label="Gastos operativos" value={money(o.operatingExpenses)} />
        <StatCard label="Costos de productos" value={money(o.productCost)} />
        <StatCard label="Comisiones generadas" value={money(o.commissionsGenerated)} />
        <StatCard label="Costos totales" value={money(o.totalCosts)} />
        <StatCard label="Balance de caja" value={money(o.cashBalance)} hint="Cobrado − gastos cargados" tone="primary" />
        <StatCard label={netTone === 'danger' ? 'Pérdida del período' : 'Ganancia neta'} value={money(o.netProfit)} tone={netTone} hint="Ingresos − costos" />
        <StatCard label="Margen de ganancia" value={marginPct} tone={netTone === 'danger' ? 'danger' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Ingresos y gastos por día" empty={!dailyHasData}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={daily} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dLabel" fontSize={10} tickLine={false} />
              <YAxis fontSize={10} tickLine={false} width={50} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="totalRevenue" name="Ingresos" fill={INCOME_COLOR} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill={EXPENSE_COLOR} radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="balance" name="Balance" stroke={BALANCE_COLOR} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gastos por categoría" empty={cats.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={cats} dataKey="amount" nameKey="categoryName" cx="50%" cy="50%" outerRadius={90} label={(e) => `${Number(e.percentage || 0).toFixed(0)}%`}>
                {cats.map((c, i) => <Cell key={i} fill={c.color || '#8b5cf6'} />)}
              </Pie>
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ingresos por origen" empty={!sourceHasData}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bySource} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} />
              <YAxis fontSize={10} tickLine={false} width={50} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={tip} />
              <Bar dataKey="amount" name="Ingresos" radius={[4, 4, 0, 0]}>
                {bySource.map((s, i) => <Cell key={i} fill={s.source === 'services' ? '#7c3aed' : '#0ea5e9'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Métodos de pago</CardTitle></CardHeader>
          <CardContent className="pt-1 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-green-700 mb-1">Ingresos</p>
              <div className="space-y-1">
                {PM_KEYS.map(k => {
                  const row = (o.incomeByPaymentMethod || []).find(x => x.method === k)
                  const amt = Number(row?.amount || 0)
                  if (amt <= 0) return null
                  return <div key={k} className="flex justify-between text-xs"><span className="text-muted-foreground">{PM_LABELS[k]}</span><span className="font-medium">{money(amt)}</span></div>
                })}
                {!(o.incomeByPaymentMethod || []).some(x => Number(x.amount || 0) > 0) && <p className="text-xs text-muted-foreground">Sin ingresos.</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-700 mb-1">Gastos</p>
              <div className="space-y-1">
                {PM_KEYS.map(k => {
                  const row = (o.expensesByPaymentMethod || []).find(x => x.method === k)
                  const amt = Number(row?.amount || 0)
                  if (amt <= 0) return null
                  return <div key={k} className="flex justify-between text-xs"><span className="text-muted-foreground">{PM_LABELS[k]}</span><span className="font-medium">{money(amt)}</span></div>
                })}
                {!(o.expensesByPaymentMethod || []).some(x => Number(x.amount || 0) > 0) && <p className="text-xs text-muted-foreground">Sin gastos.</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(o.topExpenses || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Mayores gastos del período</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">N°</th><th className="py-2 px-3">Descripción</th><th className="py-2 px-3">Categoría</th><th className="py-2 px-3">Fecha</th><th className="py-2 px-3 text-right">Importe</th></tr></thead>
                <tbody>
                  {(o.topExpenses || []).map(e => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{e.expenseNumber}</td>
                      <td className="py-2 px-3">{e.description}</td>
                      <td className="py-2 px-3">{e.categoryName || '—'}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{fmtDate(e.expenseDate)}</td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ==================== GASTOS ====================
function ExpensesTab({ supabase, range, categories, money, onChanged }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [saving, setSaving] = useState(false)
  const [voidDialog, setVoidDialog] = useState({ open: false, expense: null, reason: '' })
  const [form, setForm] = useState(() => ({ category_id: 'none', description: '', amount: '', expense_date: ymd(new Date()), payment_method: 'cash', supplier: '', reference: '', notes: '' }))
  const listAbort = useRef(null)
  const LIMIT = 50

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 400); return () => clearTimeout(t) }, [search])

  const loadList = useCallback(async (off = 0) => {
    if (listAbort.current) listAbort.current.abort()
    const ctrl = new AbortController(); listAbort.current = ctrl
    setLoading(true)
    try {
      const p = new URLSearchParams({ from: range.from, to: range.to, limit: String(LIMIT), offset: String(off) })
      if (filterCat !== 'all') p.set('category_id', filterCat)
      if (debounced) p.set('search', debounced)
      const res = await authFetch(supabase, `/api/booking/finance/expenses?${p}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const d = res.ok ? await res.json() : { items: [], total: 0 }
      if (ctrl.signal.aborted) return
      setItems(d.items || []); setTotal(d.total || 0); setOffset(off)
    } catch (e) { if (e?.name !== 'AbortError') { setItems([]); setTotal(0) } }
    finally { if (!ctrl.signal.aborted) setLoading(false) }
  }, [supabase, range, filterCat, debounced])

  useEffect(() => { loadList(0) }, [loadList])

  const saveExpense = async () => {
    if (!form.description.trim()) { toast.error('Ingresá una descripción'); return }
    if (!(Number(form.amount) > 0)) { toast.error('El importe debe ser mayor a cero'); return }
    setSaving(true)
    try {
      const res = await authFetch(supabase, '/api/booking/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category_id: form.category_id === 'none' ? null : form.category_id,
          description: form.description.trim(), amount: Number(form.amount), expense_date: form.expense_date,
          payment_method: form.payment_method, supplier: form.supplier || null, reference: form.reference || null, notes: form.notes || null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo registrar el gasto'); setSaving(false); return }
      toast.success('Gasto registrado')
      setItems(prev => [d, ...prev]); setTotal(t => t + 1)
      setForm({ category_id: 'none', description: '', amount: '', expense_date: ymd(new Date()), payment_method: 'cash', supplier: '', reference: '', notes: '' })
      onChanged && onChanged()
    } catch { toast.error('No se pudo registrar el gasto') }
    finally { setSaving(false) }
  }

  const doVoid = async () => {
    const { expense, reason } = voidDialog
    if (!reason.trim()) { toast.error('Indicá el motivo'); return }
    try {
      const res = await authFetch(supabase, `/api/booking/finance/expenses/${expense.id}/void`, { method: 'PUT', body: JSON.stringify({ reason: reason.trim() }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo anular'); return }
      toast.success('Gasto anulado')
      setItems(prev => prev.map(x => x.id === expense.id ? { ...x, status: 'voided', voidReason: reason.trim() } : x))
      setVoidDialog({ open: false, expense: null, reason: '' })
      onChanged && onChanged()
    } catch { toast.error('No se pudo anular') }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const currentPage = Math.floor(offset / LIMIT) + 1

  return (
    <div className="space-y-4">
      {/* Register form */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" />Registrar gasto</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div><Label className="text-xs">Categoría</Label>
            <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sin categoría</SelectItem>{categories.filter(c => c.isActive !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1"><Label className="text-xs">Descripción *</Label><Input className="h-9" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ej: Compra de shampoo" /></div>
          <div><Label className="text-xs">Importe *</Label><Input className="h-9" type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" /></div>
          <div><Label className="text-xs">Fecha</Label><Input className="h-9" type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></div>
          <div><Label className="text-xs">Forma de pago</Label>
            <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PM_KEYS.map(k => <SelectItem key={k} value={k}>{PM_LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Proveedor</Label><Input className="h-9" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
          <div><Label className="text-xs">Referencia / comprobante</Label><Input className="h-9" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><Label className="text-xs">Nota</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <Button onClick={saveExpense} disabled={saving} className="gap-1">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Guardar gasto</Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar por descripción o N°" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="w-48">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas las categorías</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {loading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin gastos en este período.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">N°</th><th className="py-2 px-3">Fecha</th><th className="py-2 px-3">Descripción</th><th className="py-2 px-3">Categoría</th><th className="py-2 px-3">Proveedor</th><th className="py-2 px-3">Pago</th><th className="py-2 px-3 text-right">Importe</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {items.map(e => {
                const voided = e.status === 'voided'
                return (
                  <tr key={e.id} className={`border-b last:border-0 ${voided ? 'opacity-60 line-through' : ''}`}>
                    <td className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">{e.expenseNumber}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(e.expenseDate)}</td>
                    <td className="py-2 px-3">{e.description}</td>
                    <td className="py-2 px-3">{e.categoryName ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: e.categoryColor || '#999' }} />{e.categoryName}</span> : '—'}</td>
                    <td className="py-2 px-3">{e.supplier || '—'}</td>
                    <td className="py-2 px-3">{PM_LABELS[e.paymentMethod] || e.paymentMethod}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap font-medium">{money(e.amount)}</td>
                    <td className="py-2 px-3">{voided ? <Badge variant="outline" className="text-red-600 border-red-200">Anulado</Badge> : <Badge variant="outline" className="text-green-700 border-green-200">Registrado</Badge>}</td>
                    <td className="py-2 px-3 text-right">
                      {!voided && <Button size="sm" variant="ghost" className="h-8 gap-1 text-red-500" onClick={() => setVoidDialog({ open: true, expense: e, reason: '' })}><Ban className="w-4 h-4" />Anular</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages} · {total} gastos</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => loadList(Math.max(0, offset - LIMIT))}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={offset + LIMIT >= total || loading} onClick={() => loadList(offset + LIMIT)}>Siguiente</Button>
          </div>
        </div>
      )}

      <Dialog open={voidDialog.open} onOpenChange={o => !o && setVoidDialog({ open: false, expense: null, reason: '' })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Anular gasto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Vas a anular <b>{voidDialog.expense?.description}</b> ({money(voidDialog.expense?.amount)}). Queda en el historial como anulado.</p>
            <div><Label className="text-xs">Motivo *</Label><Textarea rows={2} value={voidDialog.reason} onChange={e => setVoidDialog(v => ({ ...v, reason: e.target.value }))} placeholder="Ej: cargado por error" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialog({ open: false, expense: null, reason: '' })}>Cancelar</Button>
            <Button variant="destructive" onClick={doVoid}>Anular gasto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==================== GASTOS FRECUENTES ====================
function TemplatesTab({ supabase, setup, money, reloadSetup, onChanged }) {
  const templates = (setup?.templates || [])
  const categories = (setup?.categories || [])
  const [busyId, setBusyId] = useState(null)
  const [dialog, setDialog] = useState({ open: false, edit: null })
  const [form, setForm] = useState({ name: '', category_id: 'none', default_amount: '', payment_method: 'cash', supplier: '', notes: '', is_active: true })
  const [saving, setSaving] = useState(false)

  const activeTemplates = templates.filter(t => t.isActive !== false)

  const quickAdd = async (t) => {
    if (!confirm(`Agregar el gasto de hoy: ${t.name} — ${money(t.defaultAmount)}?`)) return
    setBusyId(t.id)
    try {
      const res = await authFetch(supabase, '/api/booking/finance/expenses/quick', { method: 'POST', body: JSON.stringify({ template_id: t.id }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo agregar'); return }
      toast.success('Gasto agregado correctamente')
      await reloadSetup(); onChanged && onChanged()
    } catch { toast.error('No se pudo agregar') }
    finally { setBusyId(null) }
  }

  const openNew = () => { setForm({ name: '', category_id: 'none', default_amount: '', payment_method: 'cash', supplier: '', notes: '', is_active: true }); setDialog({ open: true, edit: null }) }
  const openEdit = (t) => { setForm({ name: t.name, category_id: t.categoryId || 'none', default_amount: String(t.defaultAmount ?? ''), payment_method: t.paymentMethod || 'cash', supplier: t.supplier || '', notes: t.notes || '', is_active: t.isActive !== false }); setDialog({ open: true, edit: t }) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Ingresá el nombre'); return }
    if (!(Number(form.default_amount) > 0)) { toast.error('El importe debe ser mayor a cero'); return }
    setSaving(true)
    try {
      const edit = dialog.edit
      const url = edit ? `/api/booking/finance/templates/${edit.id}` : '/api/booking/finance/templates'
      const res = await authFetch(supabase, url, {
        method: edit ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(), category_id: form.category_id === 'none' ? null : form.category_id,
          default_amount: Number(form.default_amount), payment_method: form.payment_method,
          supplier: form.supplier || null, notes: form.notes || null, is_active: form.is_active,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo guardar'); setSaving(false); return }
      toast.success('Gasto frecuente guardado'); setDialog({ open: false, edit: null }); await reloadSetup()
    } catch { toast.error('No se pudo guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Registrá con un toque los gastos que se repiten.</p>
        <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" />Nuevo gasto frecuente</Button>
      </div>

      {activeTemplates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Todavía no tenés gastos frecuentes.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeTemplates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.categoryName || 'Sin categoría'} · {PM_LABELS[t.paymentMethod] || t.paymentMethod}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openEdit(t)}><Pencil className="w-4 h-4" /></Button>
                </div>
                <p className="text-lg font-bold text-violet-700">{money(t.defaultAmount)}</p>
                <p className="text-[11px] text-muted-foreground">{t.usageCount || 0} uso(s){t.lastUsedAt ? ` · último ${fmtDate(t.lastUsedAt)}` : ''}</p>
                <Button className="w-full gap-1 gradient-brand text-white mt-1" disabled={busyId === t.id} onClick={() => quickAdd(t)}>
                  {busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}Agregar ahora
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={o => !o && setDialog({ open: false, edit: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.edit ? 'Editar' : 'Nuevo'} gasto frecuente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Importe *</Label><Input type="number" min="0" value={form.default_amount} onChange={e => setForm({ ...form, default_amount: e.target.value })} /></div>
              <div><Label className="text-xs">Forma de pago</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PM_KEYS.map(k => <SelectItem key={k} value={k}>{PM_LABELS[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs">Categoría</Label>
              <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sin categoría</SelectItem>{categories.filter(c => c.isActive !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Proveedor</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
            <div><Label className="text-xs">Notas</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            {dialog.edit && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Activo</label>
            )}
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

// ==================== CATEGORÍAS ====================
function CategoriesTab({ supabase, categories, reloadSetup }) {
  const [dialog, setDialog] = useState({ open: false, edit: null })
  const [form, setForm] = useState({ name: '', color: '#6b7280', is_active: true, display_order: 0 })
  const [saving, setSaving] = useState(false)

  const openNew = () => { setForm({ name: '', color: '#8b5cf6', is_active: true, display_order: categories.length }); setDialog({ open: true, edit: null }) }
  const openEdit = (c) => { setForm({ name: c.name, color: c.color || '#6b7280', is_active: c.isActive !== false, display_order: c.displayOrder ?? 0 }); setDialog({ open: true, edit: c }) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Ingresá el nombre'); return }
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) { toast.error('Color inválido (usá #RRGGBB)'); return }
    setSaving(true)
    try {
      const edit = dialog.edit
      const url = edit ? `/api/booking/finance/categories/${edit.id}` : '/api/booking/finance/categories'
      const res = await authFetch(supabase, url, {
        method: edit ? 'PUT' : 'POST',
        body: JSON.stringify({ name: form.name.trim(), color: form.color, is_active: form.is_active, display_order: Number(form.display_order) || 0 }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo guardar'); setSaving(false); return }
      toast.success('Categoría guardada'); setDialog({ open: false, edit: null }); await reloadSetup()
    } catch { toast.error('No se pudo guardar') }
    finally { setSaving(false) }
  }

  const toggleActive = async (c) => {
    try {
      const res = await authFetch(supabase, `/api/booking/finance/categories/${c.id}`, {
        method: 'PUT', body: JSON.stringify({ name: c.name, color: c.color || '#6b7280', is_active: !(c.isActive !== false), display_order: c.displayOrder ?? 0 }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'No se pudo actualizar'); return }
      await reloadSetup()
    } catch { toast.error('No se pudo actualizar') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Organizá tus gastos por categoría.</p>
        <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" />Nueva categoría</Button>
      </div>

      {categories.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Sin categorías.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-2 px-3">Color</th><th className="py-2 px-3">Nombre</th><th className="py-2 px-3">Orden</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 px-3"><span className="inline-block w-5 h-5 rounded-full border" style={{ background: c.color || '#999' }} /></td>
                  <td className="py-2 px-3 font-medium">{c.name}</td>
                  <td className="py-2 px-3">{c.displayOrder ?? 0}</td>
                  <td className="py-2 px-3">{c.isActive !== false ? <Badge variant="outline" className="text-green-700 border-green-200">Activa</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactiva</Badge>}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => toggleActive(c)}>{c.isActive !== false ? 'Desactivar' : 'Activar'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}

      <Dialog open={dialog.open} onOpenChange={o => !o && setDialog({ open: false, edit: null })}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.edit ? 'Editar' : 'Nueva'} categoría</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
                  <Input className="h-9" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div><Label className="text-xs">Orden</Label><Input className="h-9" type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />Activa</label>
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
