'use client'
import React, { useState, useEffect } from 'react'
import { authFetch } from '@/lib/booking/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

export default function BookingSettings({ supabase, settings, onReload }) {
  const [form, setForm] = useState(settings || {})
  const [saving, setSaving] = useState(false)
  useEffect(() => { setForm(settings || {}) }, [settings])

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const res = await authFetch(supabase, '/api/booking/settings', { method: 'PUT', body: JSON.stringify(form) })
    setSaving(false)
    if (res.ok) { toast.success('Configuración guardada'); onReload?.() } else toast.error('Error al guardar')
  }

  const numField = (k, label, help) => (
    <div><Label>{label}</Label><Input type="number" value={form[k] ?? ''} onChange={(e) => upd(k, parseInt(e.target.value) || 0)} />{help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}</div>
  )
  const toggle = (k, label, help) => (
    <div className="flex items-center justify-between rounded-md border p-3"><div><Label>{label}</Label>{help && <p className="text-xs text-muted-foreground">{help}</p>}</div><Switch checked={!!form[k]} onCheckedChange={(v) => upd(k, v)} /></div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader><CardTitle>Configuración de la agenda</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Zona horaria</Label><Input value={form.timezone || ''} onChange={(e) => upd('timezone', e.target.value)} /></div>
            {numField('slot_interval_minutes', 'Intervalo entre turnos (min)')}
            {numField('min_booking_notice_minutes', 'Anticipación mínima (min)', 'Tiempo mínimo antes de reservar')}
            {numField('max_advance_days', 'Anticipación máxima (días)')}
          </div>
          {toggle('auto_confirm', 'Confirmar automáticamente', 'Las reservas web quedan confirmadas al instante')}
          {toggle('allow_staff_choice', 'Permitir elegir profesional')}
          {toggle('allow_multiple_services', 'Permitir varios servicios por reserva')}
          {toggle('require_phone', 'Teléfono obligatorio')}
          {toggle('whatsapp_notifications', 'Notificaciones por WhatsApp')}
          <div><Label>Instrucciones para reservar</Label><Textarea value={form.booking_instructions || ''} onChange={(e) => upd('booking_instructions', e.target.value)} placeholder="Ej: Llega 5 minutos antes..." /></div>
          <div><Label>Política de cancelación</Label><Textarea value={form.cancellation_policy || ''} onChange={(e) => upd('cancellation_policy', e.target.value)} /></div>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar configuración'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
