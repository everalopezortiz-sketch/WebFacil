'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronDown, ChevronRight, Plus, Trash2, Save, CheckCircle2, Loader2, ArrowLeft, FlaskConical, Clock, PenLine, UserCog } from 'lucide-react'
import DynamicField from './DynamicField'
import SignaturePad from './SignaturePad'
import { authFetch, uploadSignature, calcAge, fmtDate } from '@/lib/diagnostics/helpers'
import { toast } from 'sonner'

const SECTION_ORDER = ['consultation', 'history', 'scalp', 'hair', 'evaluation', 'diagnosis', 'treatment', 'recommendations']

function hydrateAnswers(bundleAnswers, fields) {
  const byField = {}
  ;(bundleAnswers || []).forEach(a => { byField[a.field_id] = a })
  const out = {}
  fields.forEach(f => {
    const a = byField[f.id]
    if (!a) return
    switch (f.field_type) {
      case 'text': case 'textarea': out[f.id] = a.text_value || ''; break
      case 'number': out[f.id] = a.number_value ?? ''; break
      case 'boolean': out[f.id] = !!a.boolean_value; break
      case 'date': out[f.id] = a.date_value || ''; break
      case 'single_select': out[f.id] = a.option_id ? { optionId: a.option_id } : (a.text_value ? { custom: a.text_value } : {}); break
      case 'multi_select': out[f.id] = Array.isArray(a.selected_values) ? a.selected_values.map(v => typeof v === 'object' ? v : { label: String(v) }) : []; break
      default: break
    }
  })
  return out
}

const emptyProduct = () => ({ product_id: '', product_name_snapshot: '', quantity: '', unit: 'g', brand: '', shade: '', oxidant_volume: '', mixing_ratio: '', instructions: '' })

export default function DiagnosticForm({ supabase, userId, client, catalog, staff = [], record, onSaved, onCancel, onSaveOption }) {
  const fields = catalog?.fields || []
  const rec = record?.record || null
  const [professionalMode, setProfessionalMode] = useState(rec?.professional_id ? 'select' : (rec?.professional_name ? 'manual' : 'select'))
  const [professionalId, setProfessionalId] = useState(rec?.professional_id || '')
  const [professionalName, setProfessionalName] = useState(rec?.professional_name || '')
  const [answers, setAnswers] = useState(() => hydrateAnswers(record?.answers, fields))
  const [exposureMin, setExposureMin] = useState(rec?.exposure_minutes ?? '')
  const [exposureNotes, setExposureNotes] = useState(rec?.exposure_notes || '')
  const [products, setProducts] = useState(() => (record?.products || []).map(p => ({ ...emptyProduct(), ...p, quantity: p.quantity ?? '' })))
  const [consent, setConsent] = useState(!!rec?.consent_accepted_at)
  const [recordId, setRecordId] = useState(rec?.id || null)
  const [saving, setSaving] = useState(false)
  const [inventory, setInventory] = useState(null)
  const [open, setOpen] = useState({ consultation: true, history: false, scalp: false, hair: false, evaluation: false, diagnosis: false, treatment: false, recommendations: false, formula: false, exposure: false, signatures: false })

  const clientSig = useRef(null)
  const proSig = useRef(null)

  const sections = useMemo(() => {
    const map = {}
    fields.forEach(f => { (map[f.section_key] = map[f.section_key] || { key: f.section_key, label: f.section_label, items: [] }).items.push(f) })
    return SECTION_ORDER.filter(k => map[k]).map(k => map[k]).concat(Object.values(map).filter(s => !SECTION_ORDER.includes(s.key)))
  }, [fields])

  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const setAnswer = (fid, v) => setAnswers(a => ({ ...a, [fid]: v }))

  const loadInventory = async () => {
    if (inventory !== null) return
    try {
      const res = await authFetch(supabase, '/api/products')
      const data = await res.json()
      setInventory(Array.isArray(data) ? data : [])
    } catch { setInventory([]) }
  }

  const serializeAnswers = () => {
    const out = []
    fields.forEach(f => {
      const v = answers[f.id]
      if (v === undefined || v === null) return
      switch (f.field_type) {
        case 'text': case 'textarea': if (String(v).trim()) out.push({ field_id: f.id, text_value: String(v) }); break
        case 'number': if (v !== '' && !isNaN(parseFloat(v))) out.push({ field_id: f.id, number_value: parseFloat(v) }); break
        case 'boolean': if (v != null) out.push({ field_id: f.id, boolean_value: !!v }); break
        case 'date': if (v) out.push({ field_id: f.id, date_value: v }); break
        case 'single_select': if (v.optionId) out.push({ field_id: f.id, option_id: v.optionId }); else if (v.custom && v.custom.trim()) out.push({ field_id: f.id, text_value: v.custom.trim() }); break
        case 'multi_select': if (Array.isArray(v) && v.length) out.push({ field_id: f.id, selected_values: v }); break
        default: break
      }
    })
    return out
  }

  const serializeProducts = () => products
    .filter(p => (p.product_name_snapshot && p.product_name_snapshot.trim()) || p.product_id)
    .map((p, i) => ({
      product_id: p.product_id || null,
      product_name_snapshot: p.product_name_snapshot || null,
      quantity: p.quantity !== '' && p.quantity != null ? parseFloat(p.quantity) : null,
      unit: p.unit || null, brand: p.brand || null, shade: p.shade || null,
      oxidant_volume: p.oxidant_volume || null, mixing_ratio: p.mixing_ratio || null,
      instructions: p.instructions || null, display_order: i,
    }))

  const buildPayload = (status, extra = {}) => ({
    record_id: recordId || undefined,
    client_id: client.id,
    status,
    professional_id: professionalMode === 'select' ? (professionalId || null) : null,
    professional_name: professionalMode === 'manual' ? (professionalName || null) : (professionalId ? (staff.find(s => s.id === professionalId)?.name || null) : null),
    exposure_minutes: exposureMin !== '' ? parseInt(exposureMin) : null,
    exposure_notes: exposureNotes || null,
    consent_accepted_at: consent ? new Date().toISOString() : null,
    answers: serializeAnswers(),
    products: serializeProducts(),
    ...extra,
  })

  const doSave = async (payload) => {
    const res = await authFetch(supabase, '/api/diagnostics/records', { method: 'POST', body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
    return data.id
  }

  const persist = async (status) => {
    if (exposureMin !== '' && (parseInt(exposureMin) < 0 || parseInt(exposureMin) > 1440)) { toast.error('El tiempo de exposici\u00f3n debe estar entre 0 y 1440 min'); return }
    setSaving(true)
    try {
      // gather signature blobs
      const cBlob = clientSig.current ? await clientSig.current.getBlob() : null
      const pBlob = proSig.current ? await proSig.current.getBlob() : null

      let id = recordId
      // initial save to obtain an id if we need to upload signatures
      if (!id) { id = await doSave(buildPayload(status)); setRecordId(id) }

      const sigExtra = {}
      if (cBlob) { const path = await uploadSignature(supabase, userId, id, 'client', cBlob); sigExtra.client_signature_path = path; sigExtra.client_signed_at = new Date().toISOString() }
      if (pBlob) { const path = await uploadSignature(supabase, userId, id, 'professional', pBlob); sigExtra.professional_signature_path = path; sigExtra.professional_signed_at = new Date().toISOString() }

      // final save (with id + signatures + status)
      const finalId = await doSave(buildPayload(status, { record_id: id, ...sigExtra }))
      toast.success(status === 'completed' ? 'Ficha finalizada' : 'Borrador guardado')
      onSaved && onSaved(finalId)
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar la ficha')
    } finally { setSaving(false) }
  }

  const age = calcAge(client.birth_date)

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1"><ArrowLeft className="w-4 h-4" />Volver</Button>
      <Card className="border-violet-200">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{client.full_name}</h2>
                {rec?.record_number && <Badge variant="outline">Ficha N° {rec.record_number}</Badge>}
                <Badge className={rec?.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>{rec?.status === 'completed' ? 'Finalizada' : 'Borrador'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {client.phone || 'Sin tel.'}{client.birth_date ? ` · ${fmtDate(client.birth_date)}${age != null ? ` (${age} años)` : ''}` : ''}{client.address ? ` · ${client.address}` : ''}
              </p>
            </div>
          </div>
          {/* Professional */}
          <Separator className="my-3" />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 space-y-1">
              <Label className="flex items-center gap-1"><UserCog className="w-4 h-4" />Profesional responsable</Label>
              {professionalMode === 'select' ? (
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar profesional" /></SelectTrigger>
                  <SelectContent>{staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={professionalName} placeholder="Nombre del profesional" onChange={e => setProfessionalName(e.target.value)} />
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setProfessionalMode(m => m === 'select' ? 'manual' : 'select')}>
              {professionalMode === 'select' ? 'Escribir otro' : 'Elegir de la lista'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dynamic sections */}
      {sections.map(s => (
        <Section key={s.key} title={s.label} open={open[s.key]} onToggle={() => toggle(s.key)}>
          <div className="grid sm:grid-cols-2 gap-4">
            {s.items.map(f => (
              <div key={f.id} className={f.field_type === 'textarea' || f.field_type === 'multi_select' ? 'sm:col-span-2' : ''}>
                <DynamicField field={f} value={answers[f.id]} onChange={v => setAnswer(f.id, v)} onSaveOption={onSaveOption} />
              </div>
            ))}
          </div>
        </Section>
      ))}

      {/* Formula & products */}
      <Section title="Fórmula y productos" icon={FlaskConical} open={open.formula} onToggle={() => { toggle('formula'); loadInventory() }}>
        <div className="space-y-3">
          {products.map((p, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Producto</Label>
                  {inventory && inventory.length > 0 ? (
                    <Select value={p.product_id || '__manual__'} onValueChange={v => {
                      if (v === '__manual__') setProducts(ps => ps.map((x, j) => j === i ? { ...x, product_id: '' } : x))
                      else { const prod = inventory.find(pr => pr.id === v); setProducts(ps => ps.map((x, j) => j === i ? { ...x, product_id: v, product_name_snapshot: prod?.name || x.product_name_snapshot } : x)) }
                    }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Elegir del inventario" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">Escribir manualmente</SelectItem>
                        {inventory.map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input className="h-9" placeholder="Nombre del producto" value={p.product_name_snapshot} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, product_name_snapshot: e.target.value } : x))} />
                </div>
                <div className="space-y-1"><Label className="text-xs">Cantidad</Label><Input className="h-9" type="number" step="0.01" value={p.quantity} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></div>
                <div className="space-y-1"><Label className="text-xs">Unidad</Label>
                  <Select value={p.unit || 'g'} onValueChange={v => setProducts(ps => ps.map((x, j) => j === i ? { ...x, unit: v } : x))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="g">g</SelectItem><SelectItem value="ml">ml</SelectItem><SelectItem value="unidad">unidad</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Tono</Label><Input className="h-9" value={p.shade} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, shade: e.target.value } : x))} /></div>
                <div className="space-y-1"><Label className="text-xs">Vol. oxidante</Label><Input className="h-9" value={p.oxidant_volume} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, oxidant_volume: e.target.value } : x))} /></div>
                <div className="space-y-1"><Label className="text-xs">Mezcla</Label><Input className="h-9" value={p.mixing_ratio} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, mixing_ratio: e.target.value } : x))} /></div>
                <div className="space-y-1"><Label className="text-xs">Marca</Label><Input className="h-9" value={p.brand} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, brand: e.target.value } : x))} /></div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Input className="h-9 flex-1" placeholder="Instrucciones / orden de aplicación" value={p.instructions} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, instructions: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => setProducts(ps => ps.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setProducts(ps => [...ps, emptyProduct()])} className="gap-1"><Plus className="w-4 h-4" />Agregar producto</Button>
        </div>
      </Section>

      {/* Exposure */}
      <Section title="Tiempo de exposición" icon={Clock} open={open.exposure} onToggle={() => toggle('exposure')}>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1"><Label>Minutos</Label><Input type="number" min={0} max={1440} value={exposureMin} onChange={e => setExposureMin(e.target.value)} /></div>
          <div className="sm:col-span-2 space-y-1"><Label>Notas de exposición / mezcla</Label><Textarea rows={2} value={exposureNotes} onChange={e => setExposureNotes(e.target.value)} /></div>
        </div>
      </Section>

      {/* Signatures */}
      <Section title="Firmas y consentimiento" icon={PenLine} open={open.signatures} onToggle={() => toggle('signatures')}>
        <div className="grid sm:grid-cols-2 gap-4">
          <SignaturePad ref={clientSig} label="Firma del cliente" />
          <SignaturePad ref={proSig} label="Firma del profesional" />
        </div>
        {(record?.client_signature_url || record?.professional_signature_url) && (
          <p className="text-xs text-muted-foreground mt-2">Ya hay firmas guardadas. Volv\u00e9 a firmar solo si quer\u00e9s reemplazarlas.</p>
        )}
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          El cliente acepta el consentimiento informado del tratamiento.
        </label>
      </Section>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t p-3 flex gap-2 justify-end z-20">
        <Button variant="outline" onClick={() => persist('draft')} disabled={saving} className="gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar borrador</Button>
        <Button onClick={() => persist('completed')} disabled={saving} className="gradient-brand text-white gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Finalizar ficha</Button>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, open, onToggle, children }) {
  return (
    <Card>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left">
        <span className="font-semibold flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-violet-500" />}{title}</span>
        {open ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4">{children}</CardContent>}
    </Card>
  )
}
