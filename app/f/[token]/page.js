'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileDown, ShieldAlert, ScrollText } from 'lucide-react'
import { fmtDate, fmtDateTime, calcAge, answerToText } from '@/lib/diagnostics/helpers'
import { buildDiagnosticPdf, pdfFilename } from '@/lib/diagnostics/pdf'

export default function SharedDiagnosticPage() {
  const params = useParams()
  const token = params.token
  const [state, setState] = useState('loading') // loading | ok | notfound
  const [bundle, setBundle] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/diagnostics/shared/${token}`, { cache: 'no-store' })
      .then(async r => { if (!r.ok) { setState('notfound'); return null } return r.json() })
      .then(d => { if (d && d.record) { setBundle(d); setState('ok') } else if (d !== null) setState('notfound') })
      .catch(() => setState('notfound'))
  }, [token])

  const downloadPdf = async () => {
    setPdfBusy(true)
    try { const doc = await buildDiagnosticPdf(bundle); doc.save(pdfFilename(bundle)) } catch { /* noop */ } finally { setPdfBusy(false) }
  }

  if (state === 'loading') return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-violet-500" /></div>
  if (state === 'notfound') return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full"><CardContent className="py-12 text-center">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-amber-500" />
        <h1 className="text-lg font-bold mb-1">Enlace no válido o vencido</h1>
        <p className="text-sm text-muted-foreground">Este enlace ya no está disponible. Solicitá uno nuevo al establecimiento.</p>
      </CardContent></Card>
    </div>
  )

  const rec = bundle.record || {}
  const client = bundle.client || {}
  const branding = bundle.branding || {}
  const age = calcAge(client.birth_date)
  const primary = branding.pdf_primary_color || '#8b5cf6'
  const answers = bundle.answers || []
  const sections = []
  const bySection = {}
  answers.forEach(a => {
    const txt = answerToText(a); if (!txt) return
    const k = a.section_key || 'otros'
    if (!bySection[k]) { bySection[k] = { label: a.section_label || 'Otros', items: [] }; sections.push(k) }
    bySection[k].items.push([a.field_label || a.field_key, txt])
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="text-white p-5" style={{ background: primary }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-sm opacity-80">{branding.store_name}</p>
            <h1 className="text-lg font-bold">{branding.pdf_title || 'Ficha Técnica de Diagnóstico Capilar'}</h1>
          </div>
          <Badge className="bg-white/20 text-white border-0">N° {rec.record_number ?? '—'}</Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex justify-end">
          <Button onClick={downloadPdf} disabled={pdfBusy} className="gap-2" style={{ background: primary }}>{pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}Descargar PDF</Button>
        </div>

        <Card><CardContent className="p-4">
          <h2 className="text-lg font-bold">{client.full_name}</h2>
          <p className="text-sm text-muted-foreground">{fmtDateTime(rec.diagnostic_date)} · {rec.professional_name || 'Sin profesional'}</p>
          <p className="text-sm text-muted-foreground">{client.phone || ''}{client.birth_date ? ` · ${fmtDate(client.birth_date)}${age != null ? ` (${age} años)` : ''}` : ''}</p>
        </CardContent></Card>

        {sections.map(k => (
          <Card key={k}><CardContent className="p-4">
            <h3 className="font-semibold mb-2" style={{ color: primary }}>{bySection[k].label}</h3>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {bySection[k].items.map(([l, v], i) => <div key={i} className="text-sm flex gap-2"><span className="text-muted-foreground min-w-[40%]">{l}:</span><span className="font-medium">{v}</span></div>)}
            </div>
          </CardContent></Card>
        ))}

        {bundle.products && bundle.products.length > 0 && (
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-2" style={{ color: primary }}>Fórmula y productos</h3>
            <div className="space-y-1 text-sm">
              {bundle.products.map((p, i) => (
                <div key={i} className="flex flex-wrap gap-x-3 border-b py-1">
                  <span className="font-medium">{p.product_name_snapshot}</span>
                  {p.quantity != null && <span>{p.quantity} {p.unit}</span>}
                  {p.shade && <span>Tono {p.shade}</span>}
                  {p.mixing_ratio && <span>Mezcla {p.mixing_ratio}</span>}
                </div>
              ))}
            </div>
          </CardContent></Card>
        )}

        {(rec.exposure_minutes != null || rec.exposure_notes) && (
          <Card><CardContent className="p-4"><h3 className="font-semibold mb-1" style={{ color: primary }}>Tiempo de exposición</h3><p className="text-sm">{rec.exposure_minutes != null ? `${rec.exposure_minutes} min` : ''} {rec.exposure_notes || ''}</p></CardContent></Card>
        )}

        {(bundle.client_signature_url || bundle.professional_signature_url) && (
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-2" style={{ color: primary }}>Firmas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><div className="border rounded-lg p-2 bg-white h-24 flex items-center justify-center">{bundle.client_signature_url ? <img src={bundle.client_signature_url} alt="Firma cliente" className="max-h-full" /> : '—'}</div><p className="text-xs mt-1 text-muted-foreground">Cliente</p></div>
              <div className="text-center"><div className="border rounded-lg p-2 bg-white h-24 flex items-center justify-center">{bundle.professional_signature_url ? <img src={bundle.professional_signature_url} alt="Firma profesional" className="max-h-full" /> : '—'}</div><p className="text-xs mt-1 text-muted-foreground">Profesional</p></div>
            </div>
          </CardContent></Card>
        )}

        <p className="text-center text-xs text-muted-foreground py-4 flex items-center justify-center gap-1"><ScrollText className="w-3 h-3" />{branding.pdf_footer || ''}</p>
      </div>
    </div>
  )
}
