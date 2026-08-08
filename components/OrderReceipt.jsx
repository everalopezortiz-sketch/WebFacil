'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { FileText, Share2, Printer, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeImageSrc } from '@/lib/imageUtils'

/**
 * Order Receipt Component
 * Renders a styled receipt and offers PDF/Print/Share actions
 *
 * Props:
 *  - order: order object (with order_items, total, customer_*, etc)
 *  - settings: user settings ({ logo_url, theme_button_color, store_description, whatsapp_number, ... })
 *  - profile: user profile ({ first_name, last_name })
 *  - open, onClose
 */
export default function OrderReceipt({ order, settings, profile, open, onClose }) {
  const receiptRef = useRef(null)
  const [busy, setBusy] = useState(false)

  if (!order) return null

  const brandColor = settings?.theme_button_color || '#7c3aed'
  const logoUrl = settings?.logo_url ? normalizeImageSrc(settings.logo_url) : null
  const storeName = (settings?.store_description || `${profile?.first_name || ''} ${profile?.last_name || ''}`).trim().toUpperCase()
  const phone = settings?.whatsapp_number || ''
  const orderNumber = order.order_number || order.id?.slice(0, 8) || ''
  const totalItems = order.order_items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
  const itemsCount = order.order_items?.length || 0

  // Wholesale discount computation: compare original (retail) price vs the sale unit price
  const itemsWithDiscount = (order.order_items || []).map((item) => {
    const qty = item.quantity || 1
    const unit = Number(item.unit_price != null ? item.unit_price : (item.price != null ? item.price : (item.subtotal || 0) / qty)) || 0
    const original = Number(item.original_price || 0)
    const hasDiscount = original > 0 && original > unit
    const discountPct = hasDiscount ? Math.round((1 - unit / original) * 100) : 0
    const saved = hasDiscount ? (original - unit) * qty : 0
    return { ...item, _qty: qty, _unit: unit, _original: original, _hasDiscount: hasDiscount, _discountPct: discountPct, _saved: saved }
  })
  const itemsSaved = itemsWithDiscount.reduce((s, i) => s + (i._saved || 0), 0)
  const orderDiscount = Number(order.discount || 0)
  const totalSaved = itemsSaved + orderDiscount
  const hasAnyDiscount = totalSaved > 0

  const formatPrice = (n) => {
    const num = Number(n || 0)
    return 'Gs. ' + num.toLocaleString('es-PY')
  }

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    return date.toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' }) +
           ' ' + date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
  }

  const paymentLabel = (m) => {
    const map = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      card: 'Tarjeta',
      whatsapp: 'WhatsApp',
    }
    return map[m] || m || 'Efectivo'
  }

  // Generate PDF from the receipt DOM node
  const generatePDF = async () => {
    if (!receiptRef.current) return null
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(receiptRef.current, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    // A4 mm = 210 x 297. Compute height ratio
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = 210
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
    return pdf
  }

  const handleDownloadPDF = async () => {
    setBusy(true)
    try {
      const pdf = await generatePDF()
      if (pdf) {
        pdf.save(`Recibo_${orderNumber}.pdf`)
        toast.success('PDF descargado')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error generando PDF')
    } finally {
      setBusy(false)
    }
  }

  const handleShare = async () => {
    setBusy(true)
    try {
      const pdf = await generatePDF()
      if (!pdf) return
      const blob = pdf.output('blob')
      const file = new File([blob], `Recibo_${orderNumber}.pdf`, { type: 'application/pdf' })

      // Try native Web Share API with files
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `Recibo #${orderNumber}`,
            text: `Recibo de ${storeName}`,
            files: [file],
          })
          toast.success('Compartido')
          return
        } catch (err) {
          // user cancelled or share failed - fallback to download
          if (err.name === 'AbortError') return
        }
      }

      // Fallback: download
      pdf.save(`Recibo_${orderNumber}.pdf`)
      toast.info('PDF descargado (compartir no disponible en este dispositivo)')
    } catch (e) {
      console.error(e)
      toast.error('Error al compartir')
    } finally {
      setBusy(false)
    }
  }

  const handlePrint = () => {
    if (!receiptRef.current) return
    const printWindow = window.open('', '_blank', 'width=800,height=900')
    if (!printWindow) {
      toast.error('Habilita las ventanas emergentes para imprimir')
      return
    }
    const html = receiptRef.current.outerHTML
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Recibo ${orderNumber}</title>
      <meta charset="utf-8" />
      <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
      </head><body>${html}</body></html>
    `)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 400)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.() }}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Recibo #{orderNumber}</DialogTitle>

        {/* Top bar */}
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <span className="font-semibold text-sm">Recibo #{orderNumber}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable preview */}
        <div className="max-h-[60vh] overflow-y-auto bg-gray-50">
          <div ref={receiptRef} className="bg-white mx-auto" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            {/* Top section */}
            <div className="flex items-start justify-between mb-6">
              <div>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    crossOrigin="anonymous"
                    style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 8 }}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 96, height: 96, borderRadius: 8,
                      background: brandColor, color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 32, fontWeight: 800,
                    }}
                  >
                    {(storeName || 'R')[0]}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.1 }}>
                  RECIBO
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: brandColor }}>
                  #{orderNumber}
                </div>
              </div>
            </div>

            {/* Store name + contact */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a', letterSpacing: '0.02em' }}>
                {storeName || 'TIENDA'}
              </div>
              {phone && (
                <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>
                  📞 {phone}
                </div>
              )}
              {order.customer_name && (
                <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
                  Cliente: <strong style={{ color: '#222' }}>{order.customer_name}</strong>
                  {order.customer_phone && ` • ${order.customer_phone}`}
                </div>
              )}
            </div>

            <div style={{ borderTop: '2px solid #eee', paddingTop: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
                {itemsCount} ítem{itemsCount !== 1 ? 's' : ''} (Ctd.: {totalItems})
              </div>
            </div>

            {/* Items */}
            <div style={{ borderTop: '1.5px solid #1a1a1a', paddingTop: 12, paddingBottom: 12 }}>
              {itemsWithDiscount.map((item, i) => {
                const qty = item._qty
                const price = item._unit
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a', minWidth: 50 }}>
                      {qty}x
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>
                        {item.product_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                        {item._hasDiscount ? (
                          <span>
                            <span style={{ textDecoration: 'line-through', color: '#bbb' }}>{formatPrice(item._original)}</span>
                            {' '}
                            <span style={{ color: brandColor, fontWeight: 700 }}>{formatPrice(price)}</span>
                          </span>
                        ) : (
                          formatPrice(price)
                        )}
                      </div>
                      {item._hasDiscount && (
                        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginTop: 3 }}>
                          -{item._discountPct}% mayorista · ahorro {formatPrice(item._saved)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
                      {formatPrice(item.subtotal || price * qty)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total */}
            <div style={{ borderTop: '1.5px solid #1a1a1a', paddingTop: 16, textAlign: 'right' }}>
              {hasAnyDiscount && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: '8px 12px',
                  marginBottom: 10,
                  textAlign: 'right',
                }}>
                  <div style={{ fontSize: 13, color: '#15803d', fontWeight: 700 }}>
                    Descuento total ahorrado: {formatPrice(totalSaved)}
                  </div>
                  {orderDiscount > 0 && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                      Incluye descuento adicional de {formatPrice(orderDiscount)}
                    </div>
                  )}
                </div>
              )}
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>
                Total: {formatPrice(order.total)}
              </div>
              {Number(order.deposit) > 0 && (
                <>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
                    Seña / Adelanto: {formatPrice(order.deposit)}
                  </div>
                  <div style={{ fontSize: 15, color: brandColor, fontWeight: 700, marginTop: 2 }}>
                    Saldo pendiente: {formatPrice(order.balance_due != null ? order.balance_due : Math.max(0, Number(order.total || 0) - Number(order.deposit || 0)))}
                  </div>
                </>
              )}
              {order.payment_method && (
                <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>
                  {paymentLabel(order.payment_method)}: {formatPrice(order.total)}
                </div>
              )}
              {order.notes && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' }}>
                  Nota: {order.notes}
                </div>
              )}
            </div>

            {/* Date */}
            <div style={{
              borderTop: '1px solid #ddd',
              marginTop: 16,
              paddingTop: 12,
              textAlign: 'center',
              fontSize: 13,
              color: '#888',
            }}>
              {formatDate(order.createdAt || order.created_at)}
            </div>

            {/* Branded footer */}
            <div style={{
              marginTop: 20,
              paddingTop: 12,
              borderTop: `2px dashed ${brandColor}`,
              textAlign: 'center',
              fontSize: 11,
              color: brandColor,
              fontWeight: 600,
            }}>
              ¡Gracias por tu compra! 💜
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="grid grid-cols-3 border-t bg-slate-900 text-white">
          <button
            onClick={handleDownloadPDF}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-slate-800 transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            <span className="text-xs font-medium">PDF</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-slate-800 transition disabled:opacity-50 border-x border-slate-700"
          >
            <Printer className="w-5 h-5" />
            <span className="text-xs font-medium">Imprimir</span>
          </button>
          <button
            onClick={handleShare}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 py-3 hover:bg-slate-800 transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
            <span className="text-xs font-medium">Compartir</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
