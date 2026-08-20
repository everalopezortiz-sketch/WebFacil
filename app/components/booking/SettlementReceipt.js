'use client'
// Reusable settlement receipt PDF (jsPDF). Supports a "pending" preview
// (before payment) and a "final" receipt (after payment). Manual pagination
// keeps table rows from being cut across pages.

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

const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return '' } }
const fmtDateOnly = (d) => { if (!d) return ''; try { const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}` } catch { return d } }

function makeMoney(currency) {
  const isPyg = (currency || 'PYG') === 'PYG'
  const sym = isPyg ? 'Gs' : (currency === 'USD' ? 'US$' : currency || '')
  return (v) => {
    const n = Number(v || 0)
    const s = isPyg ? Math.round(n).toLocaleString('es-PY') : n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${sym} ${s}`
  }
}

/**
 * bundle: { mode:'pending'|'final', staff, branding, lines[], advances[],
 *   baseSalary, commissionTotal, advancesTotal, netPaid, periodStart, periodEnd,
 *   settlementNumber, paymentMethod, paidAt, notes, currency }
 */
export async function buildSettlementPdf(bundle) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const money = makeMoney(bundle.currency)
  const M = 14
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - M * 2
  const isFinal = bundle.mode === 'final'
  const branding = bundle.branding || {}
  let y = 12

  const logo = await loadImage(branding.logo_url)
  if (logo && logo.dataUrl) {
    try {
      const lh = 16
      const ratio = logo.w && logo.h ? logo.w / logo.h : 1
      const lw = Math.min(40, lh * ratio)
      doc.addImage(logo.dataUrl, logo.fmt, M, y, lw, lh)
    } catch { /* skip logo */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30, 30, 30)
  doc.text(branding.business_name || 'Negocio', pageW - M, y + 5, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
  if (branding.phone) doc.text(String(branding.phone), pageW - M, y + 10, { align: 'right' })
  if (branding.address) doc.text(String(branding.address).slice(0, 60), pageW - M, y + 14, { align: 'right' })
  y += 22

  doc.setDrawColor(220); doc.line(M, y, pageW - M, y); y += 7

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20)
  doc.text(isFinal ? 'Comprobante de liquidación' : 'Estado pendiente (previsualización)', M, y); y += 7

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60)
  const staff = bundle.staff || {}
  doc.text(`Personal: ${staff.name || '-'}${staff.job_title ? ' — ' + staff.job_title : ''}`, M, y); y += 5
  doc.text(`Período: ${fmtDateOnly(bundle.periodStart)} al ${fmtDateOnly(bundle.periodEnd)}`, M, y); y += 5
  if (isFinal && bundle.settlementNumber) { doc.text(`N° de liquidación: ${bundle.settlementNumber}`, M, y); y += 5 }
  if (isFinal && bundle.paidAt) { doc.text(`Fecha de pago: ${fmtDate(bundle.paidAt)}`, M, y); y += 5 }
  y += 2

  // Table header
  const cols = [
    { key: 'date', label: 'Fecha', w: 20, align: 'left' },
    { key: 'client', label: 'Cliente', w: 34, align: 'left' },
    { key: 'service', label: 'Servicio', w: 46, align: 'left' },
    { key: 'base', label: 'Base', w: 28, align: 'right' },
    { key: 'pct', label: '%', w: 14, align: 'right' },
    { key: 'comm', label: 'Comisión', w: contentW - 20 - 34 - 46 - 28 - 14, align: 'right' },
  ]
  const drawHeader = () => {
    doc.setFillColor(124, 58, 237); doc.rect(M, y, contentW, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255)
    let x = M + 2
    cols.forEach(c => { doc.text(c.label, c.align === 'right' ? x + c.w - 4 : x, y + 4.7, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w })
    y += 7
  }
  drawHeader()

  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5)
  const lines = bundle.lines || []
  const rowH = 6
  lines.forEach((ln, i) => {
    if (y + rowH > pageH - 40) { doc.addPage(); y = 14; drawHeader(); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5) }
    if (i % 2 === 0) { doc.setFillColor(245, 243, 255); doc.rect(M, y, contentW, rowH, 'F') }
    let x = M + 2
    const vals = {
      date: fmtDate(ln.completed_at),
      client: (ln.customer_name || '-').slice(0, 20),
      service: (ln.service_name || '-').slice(0, 28),
      base: money(ln.net_amount),
      pct: `${Number(ln.commission_percent || 0)}%`,
      comm: money(ln.commission_amount),
    }
    cols.forEach(c => { doc.text(String(vals[c.key]), c.align === 'right' ? x + c.w - 4 : x, y + 4.2, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w })
    y += rowH
  })
  if (lines.length === 0) { doc.setTextColor(120); doc.text('Sin servicios en el período.', M + 2, y + 4); y += rowH }
  y += 4

  // Summary
  const ensureSpace = (h) => { if (y + h > pageH - 30) { doc.addPage(); y = 16 } }
  ensureSpace(40)
  doc.setDrawColor(220); doc.line(M, y, pageW - M, y); y += 6
  const sumRow = (label, val, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5)
    doc.setTextColor(bold ? 20 : 70, bold ? 20 : 70, bold ? 20 : 70)
    doc.text(label, pageW - M - 60, y, { align: 'left' })
    doc.text(money(val), pageW - M, y, { align: 'right' })
    y += bold ? 7 : 5.5
  }
  sumRow('Sueldo fijo', bundle.baseSalary || 0)
  sumRow('Comisiones', bundle.commissionTotal || 0)
  sumRow('Adelantos descontados', -(bundle.advancesTotal || 0))
  doc.setDrawColor(200); doc.line(pageW - M - 60, y - 1, pageW - M, y - 1); y += 3
  sumRow('Total a pagar', bundle.netPaid || 0, true)
  y += 2

  if (bundle.paymentMethod) {
    const pmLabel = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', mixed: 'Mixto', other: 'Otro' }[bundle.paymentMethod] || bundle.paymentMethod
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70)
    doc.text(`Forma de pago: ${pmLabel}`, M, y); y += 6
  }
  if (bundle.notes) {
    ensureSpace(14)
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(90)
    const noteLines = doc.splitTextToSize(`Observaciones: ${bundle.notes}`, contentW)
    doc.text(noteLines, M, y); y += noteLines.length * 4.5 + 2
  }

  // Signatures
  ensureSpace(30)
  y = Math.max(y + 8, pageH - 34)
  const half = contentW / 2
  doc.setDrawColor(120)
  doc.line(M + 6, y, M + half - 10, y)
  doc.line(M + half + 10, y, pageW - M - 6, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
  doc.text('Entregué conforme', M + 6 + (half - 16) / 2, y + 5, { align: 'center' })
  doc.text('Recibí conforme', M + half + 10 + (half - 16) / 2, y + 5, { align: 'center' })

  return doc
}

export async function downloadSettlementPdf(bundle) {
  const doc = await buildSettlementPdf(bundle)
  const name = bundle.settlementNumber || `liquidacion-${(bundle.staff?.name || '').replace(/\s+/g, '_')}`
  doc.save(`${name}.pdf`)
}

export async function printSettlementPdf(bundle) {
  const doc = await buildSettlementPdf(bundle)
  const url = doc.output('bloburl')
  const w = window.open(url, '_blank')
  if (w) { w.onload = () => { try { w.print() } catch { } } }
}
