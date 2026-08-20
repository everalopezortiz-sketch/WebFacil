'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Pencil, FileDown, Share2, Loader2, MessageCircle, Copy, Link2, Ban, Clock, Trash2 } from 'lucide-react'
import { authFetch, fmtDate, fmtDateTime, calcAge, answerToText, STATUS_LABELS } from '@/lib/diagnostics/helpers'
import { buildDiagnosticPdf, pdfFilename } from '@/lib/diagnostics/pdf'
import { toast } from 'sonner'

export default function RecordView({ supabase, recordId, businessPhone, onBack, onEdit, onDeleted }) {
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareDialog, setShareDialog] = useState({ open: false, link: null })
  const [delDialog, setDelDialog] = useState(false)
  const [delBusy, setDelBusy] = useState(false)

  useEffect(() => { load() }, [recordId])
  const load = async () => {
    setLoading(true)
    try {
      const res = await authFetch(supabase, `/api/diagnostics/records/${recordId}`)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo cargar'); return }
      setBundle(data)
    } finally { setLoading(false) }
  }

  const makePdfBlob = async () => {
    const doc = await buildDiagnosticPdf(bundle)
    return { blob: doc.output('blob'), doc }
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const doc = await buildDiagnosticPdf(bundle)
      doc.save(pdfFilename(bundle))
    } catch (e) { toast.error('No se pudo generar el PDF') }
    finally { setPdfBusy(false) }
  }

  const createLink = async () => {
    const res = await authFetch(supabase, `/api/diagnostics/records/${recordId}/share`, { method: 'POST', body: JSON.stringify({}) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudo generar el enlace')
    return data
  }

  const share = async () => {
    if (bundle?.record?.status !== 'completed') { toast.error('Solo pod\u00e9s compartir una ficha finalizada'); return }
    setShareBusy(true)
    try {
      // Try native file share first
      try {
        const { blob } = await makePdfBlob()
        const file = new File([blob], pdfFilename(bundle), { type: 'application/pdf' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Ficha capilar', text: `Ficha capilar de ${bundle.client?.full_name || ''}` })
          setShareBusy(false)
          return
        }
      } catch (e) { if (e && e.name === 'AbortError') { setShareBusy(false); return } }
      // Fallback: short link
      const link = await createLink()
      setShareDialog({ open: true, link })
    } catch (e) { toast.error(e.message || 'No se pudo compartir') }
    finally { setShareBusy(false) }
  }

  const fullUrl = (path) => `${window.location.origin}${path}`

  const openWhatsapp = (link) => {
    const url = fullUrl(link.path)
    const store = bundle?.branding?.store_name || ''
    const msg = `Hola ${bundle.client?.full_name || ''}! Te comparto tu ficha capilar de ${store}: ${url}`
    const phone = (businessPhone || '').replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const copyLink = (link) => {
    navigator.clipboard.writeText(fullUrl(link.path)).then(() => toast.success('Enlace copiado')).catch(() => toast.error('No se pudo copiar'))
  }

  const revokeLink = async (link) => {
    try {
      const res = await authFetch(supabase, `/api/diagnostics/records/${recordId}/share`, { method: 'DELETE', body: JSON.stringify({ link_id: link.link_id }) })
      if (res.ok) { toast.success('Enlace revocado'); setShareDialog({ open: false, link: null }) }
      else toast.error('No se pudo revocar')
    } catch { toast.error('No se pudo revocar') }
  }

  const deleteRecord = async () => {
    setDelBusy(true)
    try {
      const res = await authFetch(supabase, `/api/diagnostics/records/${recordId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { toast.success('Ficha eliminada'); setDelDialog(false); onDeleted ? onDeleted() : onBack?.() }
      else toast.error(data.error || 'No se pudo eliminar la ficha')
    } catch { toast.error('No se pudo eliminar la ficha') }
    finally { setDelBusy(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
  if (!bundle) return null

  const rec = bundle.record || {}
  const client = bundle.client || {}
  const age = calcAge(client.birth_date)
  const status = STATUS_LABELS[rec.status] || STATUS_LABELS.draft
  const answers = bundle.answers || []
  const sections = []
  const bySection = {}
  answers.forEach(a => {
    const txt = answerToText(a)
    if (!txt) return
    const k = a.section_key || 'otros'
    if (!bySection[k]) { bySection[k] = { label: a.section_label || 'Otros', items: [] }; sections.push(k) }
    bySection[k].items.push([a.field_label || a.field_key, txt])
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ArrowLeft className="w-4 h-4" />Volver</Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onEdit(bundle)} className="gap-1"><Pencil className="w-4 h-4" />Editar ficha</Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={pdfBusy} className="gap-1">{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}PDF</Button>
          <Button size="sm" onClick={share} disabled={shareBusy || rec.status !== 'completed'} className="gap-1 gradient-brand text-white">{shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}Compartir</Button>
          <Button variant="outline" size="sm" onClick={() => setDelDialog(true)} className="gap-1 text-red-600 border-red-200 hover:bg-red-50"><Trash2 className="w-4 h-4" />Eliminar ficha</Button>
        </div>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-lg font-bold">{client.full_name}</h2>
          <Badge variant="outline">Ficha N° {rec.record_number ?? '—'}</Badge>
          <Badge className={status.cls}>{status.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {fmtDateTime(rec.diagnostic_date)} · {rec.professional_name || 'Sin profesional'}
        </p>
        <p className="text-sm text-muted-foreground">
          {client.phone || 'Sin tel.'}{client.birth_date ? ` · ${fmtDate(client.birth_date)}${age != null ? ` (${age} años)` : ''}` : ''}{client.address ? ` · ${client.address}` : ''}
        </p>
        {rec.status !== 'completed' && <p className="text-xs text-amber-600 mt-2">Esta ficha es un borrador. Finaliz\u00e1la para poder compartirla.</p>}
      </CardContent></Card>

      {sections.map(k => (
        <Card key={k}><CardContent className="p-4">
          <h3 className="font-semibold text-violet-700 mb-2">{bySection[k].label}</h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {bySection[k].items.map(([l, v], i) => (
              <div key={i} className="text-sm flex gap-2"><span className="text-muted-foreground min-w-[40%]">{l}:</span><span className="font-medium">{v}</span></div>
            ))}
          </div>
        </CardContent></Card>
      ))}

      {bundle.products && bundle.products.length > 0 && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold text-violet-700 mb-2">Fórmula y productos</h3>
          <div className="space-y-1 text-sm">
            {bundle.products.map((p, i) => (
              <div key={i} className="flex flex-wrap gap-x-3 border-b py-1">
                <span className="font-medium">{p.product_name_snapshot}</span>
                {p.quantity != null && <span>{p.quantity} {p.unit}</span>}
                {p.shade && <span>Tono {p.shade}</span>}
                {p.oxidant_volume && <span>Oxid. {p.oxidant_volume}</span>}
                {p.mixing_ratio && <span>Mezcla {p.mixing_ratio}</span>}
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}

      {(rec.exposure_minutes != null || rec.exposure_notes) && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold text-violet-700 mb-1">Tiempo de exposición</h3>
          <p className="text-sm">{rec.exposure_minutes != null ? `${rec.exposure_minutes} min` : ''} {rec.exposure_notes || ''}</p>
        </CardContent></Card>
      )}

      {(bundle.client_signature_url || bundle.professional_signature_url) && (
        <Card><CardContent className="p-4">
          <h3 className="font-semibold text-violet-700 mb-2">Firmas</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center"><div className="border rounded-lg p-2 bg-white h-24 flex items-center justify-center">{bundle.client_signature_url ? <img src={bundle.client_signature_url} alt="Firma cliente" className="max-h-full" /> : <span className="text-xs text-muted-foreground">—</span>}</div><p className="text-xs mt-1 text-muted-foreground">Cliente</p></div>
            <div className="text-center"><div className="border rounded-lg p-2 bg-white h-24 flex items-center justify-center">{bundle.professional_signature_url ? <img src={bundle.professional_signature_url} alt="Firma profesional" className="max-h-full" /> : <span className="text-xs text-muted-foreground">—</span>}</div><p className="text-xs mt-1 text-muted-foreground">Profesional</p></div>
          </div>
        </CardContent></Card>
      )}

      <Dialog open={shareDialog.open} onOpenChange={o => setShareDialog(s => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" />Compartir ficha</DialogTitle></DialogHeader>
          {shareDialog.link && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Tu dispositivo no permite compartir el archivo directamente. Compart\u00ed este enlace seguro (vence el {fmtDate(shareDialog.link.expires_at)}):</p>
              <div className="flex gap-2">
                <Input readOnly value={fullUrl(shareDialog.link.path)} className="text-xs" />
                <Button size="icon" variant="outline" onClick={() => copyLink(shareDialog.link)}><Copy className="w-4 h-4" /></Button>
              </div>
              <Button className="w-full bg-green-500 hover:bg-green-600 text-white gap-2" onClick={() => openWhatsapp(shareDialog.link)}><MessageCircle className="w-4 h-4" />Enviar por WhatsApp</Button>
              <Button variant="ghost" className="w-full text-red-500 gap-2" onClick={() => revokeLink(shareDialog.link)}><Ban className="w-4 h-4" />Revocar enlace</Button>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />El enlace vence autom\u00e1ticamente. Pod\u00e9s revocarlo cuando quieras.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={delDialog} onOpenChange={setDelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="w-5 h-5" />Eliminar ficha</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Vas a eliminar de forma <strong>permanente</strong> la <strong>Ficha N° {rec.record_number ?? '—'}</strong> de <strong>{client.full_name}</strong>.</p>
            <p className="text-sm text-muted-foreground">Se borrarán también sus respuestas, productos, enlaces compartidos y firmas. Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDelDialog(false)} disabled={delBusy}>Cancelar</Button>
              <Button variant="destructive" onClick={deleteRecord} disabled={delBusy} className="gap-1">{delBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Eliminar definitivamente</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
