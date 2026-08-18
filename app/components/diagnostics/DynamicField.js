'use client'

import React, { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, X, Check } from 'lucide-react'
import { toast } from 'sonner'

// Renders one dynamic diagnostic field. value/onChange model per field_type:
//  text/textarea -> string ; number -> string ; boolean -> bool ; date -> string
//  single_select -> { optionId, custom }  ; multi_select -> [{ optionId, label }]
export default function DynamicField({ field, value, onChange, onSaveOption }) {
  const t = field.field_type
  const opts = field.options || []
  const [customInput, setCustomInput] = useState('')
  const [saveForFuture, setSaveForFuture] = useState(false)

  if (t === 'text') {
    return <Field field={field}><Input value={value || ''} placeholder={field.placeholder || ''} onChange={e => onChange(e.target.value)} /></Field>
  }
  if (t === 'textarea') {
    return <Field field={field}><Textarea value={value || ''} placeholder={field.placeholder || ''} rows={2} onChange={e => onChange(e.target.value)} /></Field>
  }
  if (t === 'number') {
    return <Field field={field}><Input type="number" value={value ?? ''} placeholder={field.placeholder || ''} onChange={e => onChange(e.target.value)} /></Field>
  }
  if (t === 'boolean') {
    return (
      <div className="flex items-center justify-between py-1">
        <Label className="text-sm">{field.label}{field.is_required && <span className="text-red-500"> *</span>}</Label>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    )
  }
  if (t === 'date') {
    return <Field field={field}><Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} /></Field>
  }

  if (t === 'single_select') {
    const v = value || {}
    const isCustom = !!v.custom
    const addCustom = async () => {
      const label = customInput.trim()
      if (!label) return
      if (saveForFuture && onSaveOption) {
        const opt = await onSaveOption(field, label)
        if (opt) { onChange({ optionId: opt.id }); setCustomInput(''); return }
      }
      onChange({ custom: label }); setCustomInput('')
    }
    return (
      <Field field={field}>
        <Select value={v.optionId || (isCustom ? '__custom__' : '')} onValueChange={val => { if (val === '__custom__') onChange({ custom: v.custom || ' ' }); else onChange({ optionId: val }) }}>
          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
          <SelectContent>
            {opts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
            {field.allow_custom_value && <SelectItem value="__custom__">Otro (escribir)...</SelectItem>}
          </SelectContent>
        </Select>
        {isCustom && (
          <div className="mt-2 space-y-1">
            <Input autoFocus value={v.custom === ' ' ? '' : v.custom} placeholder="Escribí el valor" onChange={e => onChange({ custom: e.target.value })} />
            {onSaveOption && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={saveForFuture} onChange={e => setSaveForFuture(e.target.checked)} /> Guardar como nueva opción</label>}
            {saveForFuture && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { const l = (v.custom || '').trim(); if (!l) return; const opt = await onSaveOption(field, l); if (opt) onChange({ optionId: opt.id }) }}><Check className="w-3 h-3 mr-1" />Guardar opción</Button>}
          </div>
        )}
      </Field>
    )
  }

  if (t === 'multi_select') {
    const arr = Array.isArray(value) ? value : []
    const has = (o) => arr.some(x => x.optionId === o.id)
    const toggle = (o) => { onChange(has(o) ? arr.filter(x => x.optionId !== o.id) : [...arr, { optionId: o.id, label: o.label }]) }
    const addCustom = async () => {
      const label = customInput.trim()
      if (!label) return
      if (arr.some(x => (x.label || '').toLowerCase() === label.toLowerCase())) { setCustomInput(''); return }
      if (saveForFuture && onSaveOption) {
        const opt = await onSaveOption(field, label)
        if (opt) { onChange([...arr, { optionId: opt.id, label: opt.label }]); setCustomInput(''); return }
      }
      onChange([...arr, { label }]); setCustomInput('')
    }
    return (
      <Field field={field}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {opts.map(o => (
            <Badge key={o.id} onClick={() => toggle(o)} className={`cursor-pointer ${has(o) ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{o.label}</Badge>
          ))}
        </div>
        {arr.filter(x => !x.optionId).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {arr.filter(x => !x.optionId).map((x, i) => (
              <Badge key={'c' + i} className="bg-emerald-600 text-white gap-1">{x.label}<X className="w-3 h-3 cursor-pointer" onClick={() => onChange(arr.filter(y => y !== x))} /></Badge>
            ))}
          </div>
        )}
        {field.allow_custom_value && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input value={customInput} placeholder="Agregar otro..." onChange={e => setCustomInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
              <Button type="button" size="icon" variant="outline" onClick={addCustom}><Plus className="w-4 h-4" /></Button>
            </div>
            {onSaveOption && <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={saveForFuture} onChange={e => setSaveForFuture(e.target.checked)} /> Guardar como nueva opción para futuras fichas</label>}
          </div>
        )}
      </Field>
    )
  }

  return null
}

function Field({ field, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{field.label}{field.is_required && <span className="text-red-500"> *</span>}</Label>
      {children}
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
    </div>
  )
}
