'use client'

import { fmtDate, fmtDateTime, answerToText } from './helpers'

// Load a remote image (logo / signature) as dataURL + natural size.
async function loadImage(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    const dims = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = dataUrl
    })
    let fmt = 'PNG'
    if (/jpeg|jpg/i.test(blob.type)) fmt = 'JPEG'
    else if (/webp/i.test(blob.type)) fmt = 'WEBP'
    return { dataUrl, ...dims, fmt }
  } catch { return null }
}

function hexToRgb(hex) {
  const h = (hex || '#8b5cf6').replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Build the hair-diagnostic PDF from a bundle and return the jsPDF doc.
 * bundle: { record, client, answers[], products[], branding, client_signature_url, professional_signature_url }
 */
export async function buildDiagnosticPdf(bundle) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const PW = 210, PH = 297, M = 15
  const CW = PW - M * 2
  const branding = bundle.branding || {}
  const rec = bundle.record || {}
  const client = bundle.client || {}
  const [pr, pg, pb] = hexToRgb(branding.pdf_primary_color)
  let y = M

  const [logo] = await Promise.all([loadImage(branding.logo_url)])

  const ensure = (h) => { if (y + h > PH - 20) { doc.addPage(); y = M } }

  // ---- Header band ----
  doc.setFillColor(pr, pg, pb)
  doc.rect(0, 0, PW, 32, 'F')
  if (logo && logo.dataUrl) {
    try {
      const ratio = logo.w && logo.h ? logo.w / logo.h : 1
      const lh = 18, lw = Math.min(40, lh * ratio)
      doc.addImage(logo.dataUrl, logo.fmt, M, 7, lw, lh)
    } catch { /* skip logo */ }
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(branding.store_name || 'Mi negocio', PW - M, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text(branding.pdf_title || 'Ficha Técnica de Diagnóstico Capilar', PW - M, 21, { align: 'right' })
  doc.setFontSize(9)
  doc.text(`Ficha N° ${rec.record_number ?? '—'}  ·  ${fmtDateTime(rec.diagnostic_date)}`, PW - M, 27, { align: 'right' })
  y = 40

  // ---- Client + professional block ----
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Datos del cliente', M, y); y += 5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  const age = client.birth_date ? (() => { const b = new Date(client.birth_date); let a = new Date().getFullYear() - b.getFullYear(); const m = new Date().getMonth() - b.getMonth(); if (m < 0 || (m === 0 && new Date().getDate() < b.getDate())) a--; return a })() : null
  const infoLeft = [
    ['Nombre', client.full_name || '—'],
    ['Teléfono', client.phone || '—'],
    ['Nacimiento', client.birth_date ? `${fmtDate(client.birth_date)}${age != null ? ` (${age} años)` : ''}` : '—'],
    ['Dirección', client.address || '—'],
  ]
  const infoRight = [
    ['Profesional', rec.professional_name || '—'],
    ['Estado', rec.status === 'completed' ? 'Finalizada' : rec.status === 'archived' ? 'Archivada' : 'Borrador'],
    ['Documento', client.document || '—'],
    ['Email', client.email || '—'],
  ]
  const rowH = 5.5
  for (let i = 0; i < infoLeft.length; i++) {
    doc.setFont('helvetica', 'bold'); doc.text(`${infoLeft[i][0]}:`, M, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(infoLeft[i][1]).slice(0, 45), M + 24, y)
    doc.setFont('helvetica', 'bold'); doc.text(`${infoRight[i][0]}:`, M + CW / 2, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(infoRight[i][1]).slice(0, 40), M + CW / 2 + 24, y)
    y += rowH
  }
  y += 2

  const sectionHeader = (title) => {
    ensure(12)
    doc.setFillColor(pr, pg, pb)
    doc.setDrawColor(pr, pg, pb)
    doc.roundedRect(M, y, CW, 7, 1, 1, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(title.toUpperCase(), M + 3, y + 4.8)
    doc.setTextColor(30, 30, 30)
    y += 10
  }

  const fieldRow = (label, value) => {
    if (!value) return
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    const labelLines = doc.splitTextToSize(`${label}:`, 55)
    doc.setFont('helvetica', 'normal')
    const valLines = doc.splitTextToSize(String(value), CW - 60)
    const h = Math.max(labelLines.length, valLines.length) * 4.6 + 1.5
    ensure(h)
    doc.setFont('helvetica', 'bold'); doc.text(labelLines, M, y + 3.6)
    doc.setFont('helvetica', 'normal'); doc.text(valLines, M + 58, y + 3.6)
    y += h
  }

  // ---- Dynamic answers grouped by section ----
  const answers = bundle.answers || []
  const sections = []
  const bySection = {}
  answers.forEach(a => {
    const key = a.section_key || 'otros'
    if (!bySection[key]) { bySection[key] = { label: a.section_label || 'Otros', items: [] }; sections.push(key) }
    const txt = answerToText(a)
    if (txt) bySection[key].items.push([a.field_label || a.field_key, txt])
  })
  sections.forEach(key => {
    const s = bySection[key]
    if (!s.items.length) return
    sectionHeader(s.label)
    s.items.forEach(([l, v]) => fieldRow(l, v))
  })

  // ---- Structured summary (record columns) ----
  const structured = [
    ['Motivo de consulta', rec.consultation_reason],
    ['Diagnóstico', rec.diagnosis_summary],
    ['Tratamiento / Protocolo', rec.treatment_plan],
    ['Observaciones', rec.general_observations],
    ['Recomendaciones', rec.recommendations],
    ['Próximo control', rec.next_check_date ? fmtDate(rec.next_check_date) : ''],
    ['Próxima sesión', rec.next_session_notes],
  ].filter(r => r[1])
  if (structured.length) {
    sectionHeader('Diagnóstico y recomendaciones')
    structured.forEach(([l, v]) => fieldRow(l, v))
  }

  // ---- Products / formula table ----
  const products = bundle.products || []
  if (products.length) {
    sectionHeader('Fórmula y productos')
    ensure(8)
    doc.setFillColor(240, 240, 245); doc.rect(M, y, CW, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60)
    const cols = [M + 2, M + 78, M + 100, M + 122, M + 150]
    doc.text('Producto', cols[0], y + 4)
    doc.text('Cant.', cols[1], y + 4)
    doc.text('Tono', cols[2], y + 4)
    doc.text('Oxid.', cols[3], y + 4)
    doc.text('Mezcla', cols[4], y + 4)
    y += 6
    doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'normal')
    products.forEach(p => {
      ensure(6)
      const name = doc.splitTextToSize(String(p.product_name_snapshot || '—'), 72)
      const h = Math.max(name.length * 4, 5) + 1
      doc.text(name, cols[0], y + 3.5)
      doc.text(`${p.quantity ?? ''} ${p.unit || ''}`.trim(), cols[1], y + 3.5)
      doc.text(String(p.shade || '—'), cols[2], y + 3.5)
      doc.text(String(p.oxidant_volume || '—'), cols[3], y + 3.5)
      doc.text(String(p.mixing_ratio || '—'), cols[4], y + 3.5)
      y += h
      doc.setDrawColor(225, 225, 230); doc.line(M, y, M + CW, y)
    })
    y += 2
  }

  // ---- Exposure ----
  if (rec.exposure_minutes != null || rec.exposure_notes) {
    sectionHeader('Tiempo de exposición')
    if (rec.exposure_minutes != null) fieldRow('Minutos', `${rec.exposure_minutes} min`)
    if (rec.exposure_notes) fieldRow('Notas', rec.exposure_notes)
  }

  // ---- Signatures ----
  const [cSig, pSig] = await Promise.all([
    loadImage(bundle.client_signature_url),
    loadImage(bundle.professional_signature_url),
  ])
  ensure(34)
  y += 6
  const boxW = (CW - 10) / 2, boxH = 24
  const drawSig = (x, img, caption, signedAt) => {
    doc.setDrawColor(180, 180, 185)
    doc.roundedRect(x, y, boxW, boxH, 1, 1, 'S')
    if (img && img.dataUrl) {
      try {
        const ratio = img.w && img.h ? img.w / img.h : 2
        let sw = boxW - 8, sh = sw / ratio
        if (sh > boxH - 8) { sh = boxH - 8; sw = sh * ratio }
        doc.addImage(img.dataUrl, img.fmt, x + (boxW - sw) / 2, y + 2, sw, sh)
      } catch { /* skip */ }
    }
    doc.setFontSize(8); doc.setTextColor(90, 90, 90); doc.setFont('helvetica', 'normal')
    doc.text(caption + (signedAt ? ` · ${fmtDate(signedAt)}` : ''), x + boxW / 2, y + boxH + 4, { align: 'center' })
  }
  drawSig(M, cSig, 'Firma del cliente', rec.client_signed_at)
  drawSig(M + boxW + 10, pSig, 'Firma del profesional', rec.professional_signed_at)
  y += boxH + 8

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(pr, pg, pb); doc.setLineWidth(0.4)
    doc.line(M, PH - 14, PW - M, PH - 14)
    doc.setFontSize(8); doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'normal')
    doc.text(branding.pdf_footer || '', M, PH - 9)
    doc.text(`Página ${i} de ${pages}`, PW - M, PH - 9, { align: 'right' })
  }

  return doc
}

export function pdfFilename(bundle) {
  const rec = bundle.record || {}
  const name = (bundle.client?.full_name || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `ficha-capilar-${rec.record_number ?? 's-n'}-${name}.pdf`
}
