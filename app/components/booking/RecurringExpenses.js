'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { authFetch } from '@/lib/booking/client'
import { addCalendarMonths, bookingDate, formatCalendarDate, MONTH_PATTERN } from '@/lib/booking/dates'

const basePath = '/api/booking/finance'
const emptyExpense = {
  name: '', default_amount: '', payment_count: '1', category_id: 'none',
  payment_method: 'cash', supplier: '', notes: '', is_active: true,
}

export default function RecurringExpenses({ supabase, categories, currency, currencySymbol, paymentMethods, onChanged }) {
  const [month, setMonth] = useState(() => bookingDate().slice(0, 7))
  const [data, setData] = useState(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(emptyExpense)
  const [payment, setPayment] = useState(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const today = data?.today || bookingDate()
  const current = data?.month === month && data.version === version ? data : null
  const expenses = current?.expenses || []
  const loading = !current && !error
  const monthLabel = formatCalendarDate(month + '-01', { month: 'long', year: 'numeric' })
  const amountStep = currency === 'PYG' ? '1' : '0.01'
  const money = (value) => currencySymbol + ' ' + Number(value).toLocaleString('es-PY', { maximumFractionDigits: 2 })
  const refresh = () => setVersion(v => v + 1)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    const load = async () => {
      try {
        const res = await authFetch(supabase, basePath + '/recurring?month=' + month, { signal: controller.signal, cache: 'no-store' })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error)
        if (!controller.signal.aborted) setData({ ...result, month, version })
      } catch {
        if (!controller.signal.aborted) setError('No se pudieron cargar los gastos del mes.')
      }
    }
    load()
    return () => controller.abort()
  }, [month, supabase, version])

  const selectMonth = (value) => {
    if (MONTH_PATTERN.test(value) && Number(value.slice(0, 4)) >= 1000) {
      setError('')
      setMonth(value)
    }
  }

  const edit = (item) => {
    setForm(item ? {
      name: item.name, default_amount: String(item.amountPerPayment), payment_count: String(item.plannedPayments),
      category_id: item.categoryId || 'none', payment_method: item.paymentMethod,
      supplier: item.supplier || '', notes: item.notes || '', is_active: item.isActive,
    } : emptyExpense)
    setEditor({ id: item?.id })
  }

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const saveExpense = async (event) => {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    try {
      const url = basePath + '/templates' + (editor.id ? '/' + editor.id : '')
      const res = await authFetch(supabase, url, {
        method: editor.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form, month, category_id: form.category_id === 'none' ? null : form.category_id,
          default_amount: Number(form.default_amount), payment_count: Number(form.payment_count),
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      toast.success('Gasto frecuente guardado')
      setEditor(null)
      refresh()
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar el gasto.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const choosePayment = (item, recorded) => {
    if (recorded) {
      setPayment({ item, recorded })
      return
    }
    const lastOfMonth = new Date(addCalendarMonths(month + '-01', 1) + 'T00:00:00Z')
    lastOfMonth.setUTCDate(0)
    const lastDate = lastOfMonth.toISOString().slice(0, 10)
    setPayment({
      item, amount: String(item.amountPerPayment), date: today < lastDate ? today : lastDate,
      requestId: crypto.randomUUID(),
    })
  }

  const savePayment = async (event) => {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    const undo = Boolean(payment.recorded)
    const payload = { month, template_id: payment.item.id }
    if (undo) payload.expense_id = payment.recorded.id
    else Object.assign(payload, {
      amount: Number(payment.amount), payment_date: payment.date,
      paid_count: payment.item.payments.length, request_id: payment.requestId,
    })
    try {
      const res = await authFetch(supabase, basePath + '/recurring/payments', {
        method: undo ? 'PUT' : 'POST', body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) {
        if (res.status === 409 || res.status === 404) {
          setPayment(null)
          refresh()
        }
        throw new Error(result.error)
      }
      toast.success(undo ? 'Pago desmarcado' : 'Pago registrado')
      setPayment(null)
      refresh()
      onChanged?.()
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar el pago.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const active = expenses.filter(item => item.isActive)
  const paidAmount = expenses.reduce((total, item) => total + Number(item.paidAmount), 0)
  const pendingAmount = active.reduce((total, item) => total + (item.expectedPayments - item.payments.length) * Number(item.amountPerPayment), 0)
  const paidCount = expenses.reduce((total, item) => total + item.payments.length, 0)
  const pendingCount = active.reduce((total, item) => total + item.expectedPayments - item.payments.length, 0)

  return (
    <section className="space-y-4" aria-label="Control mensual de gastos frecuentes">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="recurring-month">Mes de los gastos</Label>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="outline" aria-label="Mes anterior"
              onClick={() => selectMonth(addCalendarMonths(month + '-01', -1).slice(0, 7))}><ChevronLeft className="size-4" /></Button>
            <Input id="recurring-month" type="month" className="w-auto min-w-0" value={month} onChange={e => selectMonth(e.target.value)} />
            <Button size="icon" variant="outline" aria-label="Mes siguiente"
              onClick={() => selectMonth(addCalendarMonths(month + '-01', 1).slice(0, 7))}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <Button onClick={() => edit(null)} className="gap-1.5"><Plus className="size-4" />Nuevo gasto frecuente</Button>
      </div>

      {error ? (
        <Card><CardContent className="p-5 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm">{error}</p><Button variant="outline" size="sm" onClick={refresh}>Reintentar</Button>
        </CardContent></Card>
      ) : loading ? (
        <p className="py-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Cargando gastos...</p>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4">
              <div><p className="text-sm text-muted-foreground">Pagado</p><p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{money(paidAmount)}</p><p className="text-xs text-muted-foreground">{paidCount} {paidCount === 1 ? 'pago' : 'pagos'}</p></div>
              <div><p className="text-sm text-muted-foreground">Pendiente</p><p className="font-semibold tabular-nums">{money(pendingAmount)}</p><p className="text-xs text-muted-foreground">{pendingCount} {pendingCount === 1 ? 'pago' : 'pagos'}</p></div>
            </CardContent>
          </Card>

          {expenses.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay gastos frecuentes para {monthLabel}.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {expenses.map(item => {
                const remaining = item.expectedPayments - item.payments.length
                return (
                  <Card key={item.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold break-words">{item.name}</h3>
                          <p className="text-xs text-muted-foreground">{[item.categoryName, paymentMethods[item.paymentMethod]].filter(Boolean).join(' · ')}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={'Editar ' + item.name} onClick={() => edit(item)}><Pencil className="size-4" /></Button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm"><span className="font-semibold tabular-nums">{money(item.amountPerPayment)}</span> <span className="text-muted-foreground">por pago</span></p>
                        <Badge variant={item.isActive && !remaining ? 'default' : 'outline'}>
                          {item.isActive ? item.payments.length + ' de ' + item.expectedPayments + ' pagos' : 'Inactivo'}
                        </Badge>
                      </div>
                      <ul className="divide-y rounded-md border px-2">
                        {item.payments.map((recorded, i) => (
                          <li key={recorded.id} className="flex items-center gap-2 py-2 text-sm">
                            <Checkbox checked aria-label={'Desmarcar pago ' + (i + 1) + ' de ' + item.name} onCheckedChange={() => choosePayment(item, recorded)} />
                            <span className="min-w-0 flex-1">Pago {i + 1} <span className="block text-xs text-muted-foreground">{formatCalendarDate(recorded.date)}</span></span>
                            <span className="text-right tabular-nums">{money(recorded.amount)}</span>
                          </li>
                        ))}
                        {item.isActive && Array.from({ length: remaining }, (_, index) => {
                          const number = item.payments.length + index + 1
                          return (
                            <li key={number} className="flex items-center gap-2 py-2 text-sm">
                              <Checkbox disabled={index > 0} id={item.id + '-pending-' + number} checked={false} aria-label={'Marcar pago ' + number + ' de ' + item.name} onCheckedChange={() => choosePayment(item)} />
                              <Label htmlFor={item.id + '-pending-' + number} className="flex-1 font-normal">Pago {number}</Label>
                              <span className="text-xs text-muted-foreground">Pendiente</span>
                            </li>
                          )
                        })}
                      </ul>
                      {item.isActive && !remaining && (
                        <Button variant="ghost" size="sm" className="h-auto px-1 py-1 gap-1.5" onClick={() => choosePayment(item)}><Plus className="size-4" />Agregar otro pago</Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Editar gasto frecuente' : 'Nuevo gasto frecuente'}</DialogTitle>
            <DialogDescription>Definí el importe por pago y cuántos pagos esperás cada mes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveExpense} className="space-y-3">
            <div><Label htmlFor="recurring-name">Nombre</Label><Input id="recurring-name" required maxLength={120} value={form.name} onChange={e => updateForm('name', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="recurring-amount">Importe por pago</Label><Input id="recurring-amount" required type="number" min={amountStep} step={amountStep} value={form.default_amount} onChange={e => updateForm('default_amount', e.target.value)} /></div>
              <div><Label htmlFor="recurring-count">Pagos por mes</Label><Input id="recurring-count" required type="number" min="1" max="24" value={form.payment_count} onChange={e => updateForm('payment_count', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor="recurring-method">Forma de pago</Label>
                <Select value={form.payment_method} onValueChange={v => updateForm('payment_method', v)}>
                  <SelectTrigger id="recurring-method"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(paymentMethods).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="recurring-category">Categoría</Label>
                <Select value={form.category_id} onValueChange={v => updateForm('category_id', v)}>
                  <SelectTrigger id="recurring-category"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Sin categoría</SelectItem>{categories.filter(c => c.isActive || c.id === form.category_id).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="recurring-supplier">Proveedor</Label><Input id="recurring-supplier" maxLength={160} value={form.supplier} onChange={e => updateForm('supplier', e.target.value)} /></div>
            <div><Label htmlFor="recurring-notes">Notas</Label><Textarea id="recurring-notes" rows={2} maxLength={300} value={form.notes} onChange={e => updateForm('notes', e.target.value)} /></div>
            {editor?.id && <Label className="flex items-center gap-2"><Checkbox checked={form.is_active} onCheckedChange={v => updateForm('is_active', v === true)} />Gasto activo</Label>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button>
              <Button disabled={busy}>{busy && <Loader2 className="size-4 mr-2 animate-spin" />}Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payment} onOpenChange={open => { if (!open && !busy) setPayment(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{payment?.recorded ? 'Desmarcar pago' : 'Marcar pago'}</DialogTitle>
            <DialogDescription>{payment?.item.name} · {monthLabel}</DialogDescription>
          </DialogHeader>
          <form onSubmit={savePayment} className="space-y-3">
            {payment?.recorded ? (
              <p className="text-sm">El pago de {money(payment.recorded.amount)} del {formatCalendarDate(payment.recorded.date)} quedará anulado en Finanzas.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label htmlFor="recorded-date">Fecha del pago</Label><Input id="recorded-date" type="date" required max={today} value={payment?.date || ''} onChange={e => setPayment(prev => ({ ...prev, date: e.target.value }))} /></div>
                <div><Label htmlFor="recorded-amount">Importe pagado</Label><Input id="recorded-amount" type="number" required min={amountStep} step={amountStep} value={payment?.amount || ''} onChange={e => setPayment(prev => ({ ...prev, amount: e.target.value }))} /></div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setPayment(null)}>Cancelar</Button>
              <Button disabled={busy} variant={payment?.recorded ? 'destructive' : 'default'}>{busy && <Loader2 className="size-4 mr-2 animate-spin" />}{payment?.recorded ? 'Desmarcar' : 'Confirmar pago'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
