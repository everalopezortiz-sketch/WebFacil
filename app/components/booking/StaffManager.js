'use client'
import React, { useState, useMemo } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, UserRound, X, CalendarOff } from 'lucide-react'
import { toast } from 'sonner'

const NO_CAT = '__none__'
const COMP_LABELS = { commission: 'Solo comisión', salary: 'Sueldo fijo', mixed: 'Sueldo + comisión' }

export default function StaffManager({ supabase, staff = [], services = [], staffServices = [], categories = [], onReload, currencySymbol = 'Gs' }) {
  const [dialog, setDialog] = useState({ open: false, data: null, assignments: [] })
  const [saving, setSaving] = useState(false)
  const [catSel, setCatSel] = useState('')
  const [svcSel, setSvcSel] = useState('')
  const [bulkPct, setBulkPct] = useState('')

  const blank = {
    name: '', job_title: '', description: '', phone: '', email: '', photo_url: '', color: '#7c3aed',
    is_active: true, is_bookable: true, employment_started_on: '', compensation_type: 'commission',
    pay_frequency: 'monthly', salary_amount: '', default_commission_percent: '', pay_weekday: '', pay_month_day: '', employment_notes: ''
  }

  const activeCategories = useMemo(() => (categories || []).filter(c => c.is_active !== false), [categories])
  const activeServices = useMemo(() => (services || []).filter(s => s.is_active !== false), [services])
  const catIdSet = useMemo(() => new Set(activeCategories.map(c => c.id)), [activeCategories])

  const pickerCategories = useMemo(() => {
    const out = activeCategories.filter(c => activeServices.some(s => s.category_id === c.id))
    if (activeServices.some(s => !s.category_id || !catIdSet.has(s.category_id))) out.push({ id: NO_CAT, name: 'Sin categoría' })
    return out
  }, [activeCategories, activeServices, catIdSet])

  const servicesOfCat = (catId) => {
    if (catId === NO_CAT) return activeServices.filter(s => !s.category_id || !catIdSet.has(s.category_id))
    return activeServices.filter(s => s.category_id === catId)
  }
  const serviceInfo = (id) => services.find(s => s.id === id)
  const catNameOf = (svc) => {
    if (!svc) return 'Sin categoría'
    const c = activeCategories.find(x => x.id === svc.category_id)
    return c ? c.name : 'Sin categoría'
  }
  const effectivePrice = (svc) => svc ? Number((svc.promo_active && svc.promo_price) ? svc.promo_price : svc.price || 0) : 0
  const money = (v) => `${currencySymbol} ${Math.round(Number(v || 0)).toLocaleString('es-PY')}`

  const open = (s) => {
    const assignments = s
      ? staffServices.filter(ss => ss.staff_id === s.id).map(ss => ({ service_id: ss.service_id, commission_percent: ss.commission_percent ?? '' }))
      : []
    const data = s ? { ...blank, ...s, salary_amount: s.salary_amount ?? '', default_commission_percent: s.default_commission_percent ?? '', pay_weekday: s.pay_weekday ?? '', pay_month_day: s.pay_month_day ?? '', employment_started_on: s.employment_started_on || '' } : { ...blank }
    setDialog({ open: true, data, assignments })
    setCatSel(''); setSvcSel(''); setBulkPct('')
  }
  const closeDialog = () => { setDialog({ open: false, data: null, assignments: [] }); setCatSel(''); setSvcSel('') }
  const setField = (k, v) => setDialog(d => ({ ...d, data: { ...d.data, [k]: v } }))

  const addService = () => {
    if (!svcSel) { toast.error('Elegí un servicio'); return }
    setDialog(d => d.assignments.some(a => a.service_id === svcSel) ? d : { ...d, assignments: [...d.assignments, { service_id: svcSel, commission_percent: '' }] })
    setSvcSel('')
  }
  const removeService = (id) => setDialog(d => ({ ...d, assignments: d.assignments.filter(a => a.service_id !== id) }))
  const setAssignPct = (id, val) => setDialog(d => ({ ...d, assignments: d.assignments.map(a => a.service_id === id ? { ...a, commission_percent: val } : a) }))
  const applyBulk = () => {
    const v = bulkPct === '' ? '' : String(bulkPct)
    setDialog(d => ({ ...d, assignments: d.assignments.map(a => ({ ...a, commission_percent: v })) }))
    toast.success(v === '' ? 'Se usará el % predeterminado en todos' : `Aplicado ${v}% a todos`)
  }

  const effPct = (a) => {
    if (a.commission_percent !== '' && a.commission_percent !== null && a.commission_percent !== undefined) return Number(a.commission_percent)
    const def = dialog.data?.default_commission_percent
    return (def === '' || def == null) ? 0 : Number(def)
  }

  const save = async () => {
    const d = dialog.data
    if (!d.name?.trim()) { toast.error('Ingresa un nombre'); return }
    const compType = d.compensation_type || 'commission'
    const payload = {
      name: d.name.trim(), job_title: d.job_title || null, description: d.description || null,
      phone: d.phone || null, email: d.email || null, photo_url: d.photo_url || null, color: d.color || '#7c3aed',
      is_active: !!d.is_active, is_bookable: !!d.is_bookable,
      employment_started_on: d.employment_started_on || null,
      compensation_type: compType, pay_frequency: d.pay_frequency || 'monthly',
      salary_amount: (compType === 'salary' || compType === 'mixed') ? (d.salary_amount === '' ? 0 : Number(d.salary_amount)) : 0,
      default_commission_percent: d.default_commission_percent === '' ? null : Number(d.default_commission_percent),
      pay_weekday: d.pay_frequency === 'weekly' ? (d.pay_weekday === '' ? null : Number(d.pay_weekday)) : null,
      pay_month_day: d.pay_frequency === 'monthly' ? (d.pay_month_day === '' ? null : Number(d.pay_month_day)) : null,
      employment_notes: d.employment_notes || null,
      service_assignments: dialog.assignments.map(a => ({ service_id: a.service_id, commission_percent: a.commission_percent === '' ? null : Number(a.commission_percent) })),
    }
    setSaving(true)
    const isEdit = !!d.id
    const res = await authFetch(supabase, isEdit ? `/api/booking/staff/${d.id}` : '/api/booking/staff', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) })
    setSaving(false)
    if (res.ok) { toast.success('Personal guardado'); closeDialog(); onReload?.() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Error al guardar') }
  }

  const del = async (id) => {
    if (!confirm('¿Eliminar esta persona? Si tiene historial (citas, servicios, adelantos), se desactivará.')) return
    const res = await authFetch(supabase, `/api/booking/staff/${id}`, { method: 'DELETE' })
    if (res.ok) { const r = await res.json(); toast.success(r.softDeleted ? 'Persona desactivada (tenía historial)' : 'Persona eliminada'); onReload?.() }
    else toast.error('No se pudo eliminar')
  }

  const svcCount = (id) => staffServices.filter(ss => ss.staff_id === id).length
  const availableInCat = servicesOfCat(catSel).filter(s => !dialog.assignments.some(a => a.service_id === s.id))
  const d = dialog.data
  const showSalary = d && (d.compensation_type === 'salary' || d.compensation_type === 'mixed')
  const showCommission = d && (d.compensation_type === 'commission' || d.compensation_type === 'mixed')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Personal</h3>
          <p className="text-sm text-muted-foreground">Datos, remuneración y servicios que realiza cada persona</p>
        </div>
        <Button onClick={() => open(null)} className="gap-2"><Plus className="w-4 h-4" />Nuevo</Button>
      </div>
      {staff.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><UserRound className="w-8 h-8 mx-auto mb-2 opacity-50" />Aún no hay personal.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0" style={{ background: s.color || '#7c3aed' }}>{s.name?.[0]?.toUpperCase()}</span>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap"><p className="font-medium truncate">{s.name}</p>{!s.is_active && <Badge variant="secondary">Inactivo</Badge>}{s.is_active && !s.is_bookable && <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300"><CalendarOff className="w-3 h-3" />No agenda</Badge>}</div>
                    {s.job_title && <p className="text-xs text-muted-foreground truncate">{s.job_title}</p>}
                    <p className="text-xs text-muted-foreground">{svcCount(s.id)} servicio(s) · {COMP_LABELS[s.compensation_type] || 'Solo comisión'}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => open(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => del(s.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog.open} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{d?.id ? 'Editar' : 'Nuevo'} personal</DialogTitle></DialogHeader>
          {d && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Nombre y apellido</Label><Input value={d.name} onChange={(e) => setField('name', e.target.value)} /></div>
                <div><Label>Cargo o especialidad</Label><Input value={d.job_title || ''} onChange={(e) => setField('job_title', e.target.value)} placeholder="Ej: Estilista" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Teléfono</Label><Input value={d.phone || ''} onChange={(e) => setField('phone', e.target.value)} /></div>
                <div><Label>Email</Label><Input value={d.email || ''} onChange={(e) => setField('email', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div><Label>Foto (URL)</Label><Input value={d.photo_url || ''} onChange={(e) => setField('photo_url', e.target.value)} placeholder="https://..." /></div>
                <div><Label>Color</Label><Input type="color" value={d.color || '#7c3aed'} onChange={(e) => setField('color', e.target.value)} className="h-10 w-20 p-1" /></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-md border p-3"><Label>Activo</Label><Switch checked={!!d.is_active} onCheckedChange={(v) => setField('is_active', v)} /></div>
                <div className="flex items-center justify-between rounded-md border p-3"><Label className="pr-2 leading-tight text-sm">Atiende clientes y aparece en Agenda</Label><Switch checked={!!d.is_bookable} onCheckedChange={(v) => setField('is_bookable', v)} /></div>
              </div>

              {/* Employment / compensation */}
              <div className="space-y-3 rounded-md border p-3">
                <p className="font-medium text-sm">Remuneración</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label className="text-xs">Fecha de ingreso</Label><Input type="date" value={d.employment_started_on || ''} onChange={(e) => setField('employment_started_on', e.target.value)} /></div>
                  <div>
                    <Label className="text-xs">Tipo de remuneración</Label>
                    <Select value={d.compensation_type} onValueChange={(v) => setField('compensation_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commission">Solo comisión</SelectItem>
                        <SelectItem value="salary">Sueldo fijo</SelectItem>
                        <SelectItem value="mixed">Sueldo + comisión</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(showSalary || showCommission) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Frecuencia de pago</Label>
                      <Select value={d.pay_frequency} onValueChange={(v) => setField('pay_frequency', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {d.pay_frequency === 'weekly' ? (
                      <div>
                        <Label className="text-xs">Día de pago (semanal)</Label>
                        <Select value={d.pay_weekday === '' ? '' : String(d.pay_weekday)} onValueChange={(v) => setField('pay_weekday', v)}>
                          <SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger>
                          <SelectContent>
                            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((n, i) => <SelectItem key={i + 1} value={String(i + 1)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div><Label className="text-xs">Día del mes (1-28)</Label><Input type="number" min="1" max="28" value={d.pay_month_day} onChange={(e) => setField('pay_month_day', e.target.value)} /></div>
                    )}
                  </div>
                )}
                {showSalary && (
                  <div><Label className="text-xs">Monto fijo por período ({currencySymbol})</Label><Input type="number" min="0" value={d.salary_amount} onChange={(e) => setField('salary_amount', e.target.value)} /></div>
                )}
                {showCommission && (
                  <div><Label className="text-xs">Porcentaje predeterminado (%)</Label><Input type="number" min="0" max="100" value={d.default_commission_percent} onChange={(e) => setField('default_commission_percent', e.target.value)} placeholder="Ej: 40" /></div>
                )}
                <div><Label className="text-xs">Observaciones laborales</Label><Textarea rows={2} value={d.employment_notes || ''} onChange={(e) => setField('employment_notes', e.target.value)} /></div>
              </div>

              {/* Service assignment + commissions */}
              <div className="space-y-2 rounded-md border p-3">
                <Label>Servicios que realiza</Label>
                {activeServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Creá servicios primero.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">Categoría</Label>
                        <Select value={catSel} onValueChange={(v) => { setCatSel(v); setSvcSel('') }}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Elegí categoría" /></SelectTrigger>
                          <SelectContent>{pickerCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Servicio</Label>
                        <Select value={svcSel} onValueChange={setSvcSel} disabled={!catSel}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={catSel ? 'Elegí servicio' : 'Elegí categoría'} /></SelectTrigger>
                          <SelectContent>
                            {availableInCat.length === 0 ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Sin servicios disponibles</div> : availableInCat.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" onClick={addService} disabled={!svcSel} className="h-9 gap-1"><Plus className="w-4 h-4" />Agregar</Button>
                    </div>

                    {dialog.assignments.length > 0 && (
                      <div className="flex items-end gap-2 pt-1 flex-wrap">
                        <div className="w-32"><Label className="text-xs text-muted-foreground">Aplicar % a todos</Label><Input type="number" min="0" max="100" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} placeholder="%" className="h-8" /></div>
                        <Button type="button" size="sm" variant="outline" onClick={applyBulk} className="h-8">Aplicar</Button>
                        <span className="text-xs text-muted-foreground pb-1">Vacío = usar predeterminado</span>
                      </div>
                    )}

                    <div className="mt-1">
                      <p className="text-xs text-muted-foreground mb-1">Servicios asignados ({dialog.assignments.length})</p>
                      {dialog.assignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Todavía no asignaste servicios.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[420px]">
                            <thead><tr className="text-xs text-muted-foreground text-left border-b"><th className="py-1 pr-2">Categoría / Servicio</th><th className="py-1 px-1 text-right">Precio</th><th className="py-1 px-1 w-24">%</th><th className="py-1 px-1 text-right">Comisión</th><th></th></tr></thead>
                            <tbody>
                              {dialog.assignments.map(a => {
                                const svc = serviceInfo(a.service_id)
                                const price = effectivePrice(svc)
                                const pct = effPct(a)
                                const est = Math.round(price * pct / 100)
                                return (
                                  <tr key={a.service_id} className="border-b last:border-0">
                                    <td className="py-1.5 pr-2"><span className="text-muted-foreground text-xs block">{catNameOf(svc)}</span><span className="font-medium">{svc?.name || 'Servicio'}</span></td>
                                    <td className="py-1.5 px-1 text-right whitespace-nowrap">{money(price)}</td>
                                    <td className="py-1.5 px-1"><Input type="number" min="0" max="100" value={a.commission_percent} onChange={(e) => setAssignPct(a.service_id, e.target.value)} placeholder="def." className="h-8 text-right" /></td>
                                    <td className="py-1.5 px-1 text-right whitespace-nowrap font-medium text-emerald-700">{money(est)}</td>
                                    <td className="py-1.5 pl-1"><button type="button" onClick={() => removeService(a.service_id)} className="text-red-500 hover:text-red-600"><X className="w-4 h-4" /></button></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
