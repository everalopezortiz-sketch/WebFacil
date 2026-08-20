'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Save, ChevronDown, ChevronRight, Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { authFetch } from '@/lib/diagnostics/helpers'
import { toast } from 'sonner'

export default function DiagnosticSettings({ supabase, settings, onSaved, onFieldsChanged }) {
  const [form, setForm] = useState({ pdf_title: '', pdf_primary_color: '#8b5cf6', pdf_footer: '', default_share_expiry_days: 7 })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm({
      pdf_title: settings.pdf_title || 'Ficha Técnica de Diagnóstico Capilar',
      pdf_primary_color: settings.pdf_primary_color || '#8b5cf6',
      pdf_footer: settings.pdf_footer || '',
      default_share_expiry_days: settings.default_share_expiry_days || 7,
    })
  }, [settings])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => {
    setSaving(true)
    try {
      const res = await authFetch(supabase, '/api/diagnostics/settings', { method: 'PUT', body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo guardar'); return }
      toast.success('Configuración guardada')
      onSaved && onSaved(data)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <Card className="max-w-lg">
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-lg">Configuración de fichas</h3>
          <div className="space-y-1"><Label>Título del PDF</Label><Input value={form.pdf_title} onChange={e => set('pdf_title', e.target.value)} /></div>
          <div className="space-y-1"><Label>Color principal</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.pdf_primary_color} onChange={e => set('pdf_primary_color', e.target.value)} className="w-12 h-10 rounded border cursor-pointer" />
              <Input value={form.pdf_primary_color} onChange={e => set('pdf_primary_color', e.target.value)} className="w-32" />
            </div>
          </div>
          <div className="space-y-1"><Label>Pie de página</Label><Input value={form.pdf_footer} onChange={e => set('pdf_footer', e.target.value)} /></div>
          <div className="space-y-1"><Label>Vencimiento por defecto de enlaces (días, máx 90)</Label><Input type="number" min={1} max={90} value={form.default_share_expiry_days} onChange={e => set('default_share_expiry_days', e.target.value)} /></div>
          <Button onClick={save} disabled={saving} className="gradient-brand text-white gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</Button>
        </CardContent>
      </Card>

      <FieldCustomizer supabase={supabase} onFieldsChanged={onFieldsChanged} />
    </div>
  )
}

// ---- Personalizar campos de la ficha ----
function FieldCustomizer({ supabase, onFieldsChanged }) {
  const [fields, setFields] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState({})

  useEffect(() => { load() }, [])
  const load = async () => {
    setLoading(true)
    try {
      const res = await authFetch(supabase, '/api/diagnostics/fields')
      const data = await res.json()
      if (res.ok) setFields(data.fields || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  // Group fields by section, preserving DB order
  const sections = React.useMemo(() => {
    const map = {}
    const order = []
    ;(fields || []).forEach(f => {
      const k = f.section_key || 'otros'
      if (!map[k]) { map[k] = { key: k, label: f.section_label || 'Otros', items: [] }; order.push(k) }
      map[k].items.push(f)
    })
    return order.map(k => map[k])
  }, [fields])

  const patchField = async (field, isActive) => {
    const prev = fields
    setFields(fs => fs.map(f => f.id === field.id ? { ...f, is_active: isActive } : f))
    const res = await authFetch(supabase, `/api/diagnostics/fields/${field.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) })
    if (!res.ok) { setFields(prev); toast.error('No se pudo actualizar el campo') }
    else onFieldsChanged && onFieldsChanged()
  }

  const patchOption = async (opt, isActive) => {
    const prev = fields
    setFields(fs => fs.map(f => f.id === opt.field_id ? { ...f, options: f.options.map(o => o.id === opt.id ? { ...o, is_active: isActive } : o) } : f))
    const res = await authFetch(supabase, `/api/diagnostics/field-options/${opt.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) })
    if (!res.ok) { setFields(prev); toast.error('No se pudo actualizar la opción') }
    else onFieldsChanged && onFieldsChanged()
  }

  const patchSection = async (section, isActive) => {
    const prev = fields
    setFields(fs => fs.map(f => (f.section_key || 'otros') === section.key ? { ...f, is_active: isActive } : f))
    const res = await authFetch(supabase, '/api/diagnostics/fields/section', { method: 'PATCH', body: JSON.stringify({ section_key: section.key, is_active: isActive }) })
    if (!res.ok) { setFields(prev); toast.error('No se pudo actualizar la sección') }
    else { onFieldsChanged && onFieldsChanged(); toast.success(isActive ? 'Sección restaurada' : 'Sección oculta en fichas nuevas') }
  }

  const toggleOpen = (k) => setOpenSections(o => ({ ...o, [k]: !o[k] }))

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></CardContent></Card>
  if (!fields || fields.length === 0) return null

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-violet-500" />Personalizar campos de la ficha</h3>
          <p className="text-sm text-muted-foreground">Elegí qué campos y opciones aparecen en las <strong>fichas nuevas</strong>. Las fichas ya guardadas conservan todos sus datos.</p>
        </div>

        <div className="space-y-2">
          {sections.map(section => {
            const active = section.items.filter(f => f.is_active !== false).length
            const total = section.items.length
            const sectionHidden = active === 0
            const isOpen = !!openSections[section.key]
            return (
              <div key={section.key} className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-2 p-3 bg-muted/40">
                  <button type="button" onClick={() => toggleOpen(section.key)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                    {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    <span className="font-medium truncate">{section.label}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">({active}/{total} visibles)</span>
                  </button>
                  <Button type="button" size="sm" variant="outline" className="gap-1 flex-shrink-0"
                    onClick={() => patchSection(section, sectionHidden)}>
                    {sectionHidden ? <><RotateCcw className="w-3.5 h-3.5" />Restaurar sección</> : <><EyeOff className="w-3.5 h-3.5" />Ocultar sección</>}
                  </Button>
                </div>

                {isOpen && (
                  <div className="p-3 space-y-2">
                    {section.items.map(f => {
                      const hidden = f.is_active === false
                      return (
                        <div key={f.id} className="rounded-md border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm ${hidden ? 'text-muted-foreground line-through' : 'font-medium'}`}>{f.label}{f.is_required && <span className="text-red-400 ml-1">*</span>}</span>
                            <Button type="button" size="sm" variant="ghost" className={`gap-1 ${hidden ? 'text-green-600' : 'text-amber-600'}`} onClick={() => patchField(f, hidden)}>
                              {hidden ? <><RotateCcw className="w-3.5 h-3.5" />Restaurar</> : <><EyeOff className="w-3.5 h-3.5" />Ocultar en fichas nuevas</>}
                            </Button>
                          </div>
                          {(f.options && f.options.length > 0) && (
                            <div className="mt-2 pl-2 flex flex-wrap gap-1.5">
                              {f.options.map(o => {
                                const oHidden = o.is_active === false
                                return (
                                  <button key={o.id} type="button" onClick={() => patchOption(o, oHidden)}
                                    className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 border ${oHidden ? 'text-muted-foreground line-through bg-muted' : 'bg-white'}`}>
                                    {oHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                    {o.label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
