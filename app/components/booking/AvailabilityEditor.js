'use client'
import React, { useState } from 'react'
import { authFetch, WEEKDAYS } from '@/lib/booking/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Clock, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

export default function AvailabilityEditor({ supabase, staff = [], availability = [], onReload }) {
  const activeStaff = staff.filter(s => s.is_active)
  const [staffId, setStaffId] = useState(activeStaff[0]?.id || '')

  const rows = availability.filter(a => a.staff_id === staffId)

  const addInterval = async (day) => {
    if (!staffId) { toast.error('Selecciona un profesional'); return }
    const res = await authFetch(supabase, '/api/booking/availability', { method: 'POST', body: JSON.stringify({ staff_id: staffId, day_of_week: day, start_time: '09:00', end_time: '13:00', is_active: true }) })
    if (res.ok) { toast.success('Intervalo agregado'); onReload?.() } else toast.error('Error al agregar')
  }

  const updateRow = async (row, field, value) => {
    const res = await authFetch(supabase, `/api/booking/availability/${row.id}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
    if (res.ok) onReload?.(); else toast.error('Error al actualizar')
  }

  const del = async (id) => {
    const res = await authFetch(supabase, `/api/booking/availability/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Intervalo eliminado'); onReload?.() } else toast.error('Error al eliminar')
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Horarios semanales</h3>
        <p className="text-sm text-muted-foreground">Puedes agregar varios intervalos en un mismo día (ej. mañana y tarde).</p>
      </div>
      {activeStaff.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Crea un profesional primero.</CardContent></Card>
      ) : (
        <>
          <div className="max-w-xs">
            <Label>Profesional</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{activeStaff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            {WEEKDAYS.map(day => {
              const dayRows = rows.filter(r => r.day_of_week === day.value)
              return (
                <Card key={day.value}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />{day.label}</p>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => addInterval(day.value)}><Plus className="w-3 h-3" />Intervalo</Button>
                    </div>
                    {dayRows.length === 0 ? <p className="text-sm text-muted-foreground">Cerrado</p> : (
                      <div className="space-y-2">
                        {dayRows.map(r => (
                          <div key={r.id} className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <Input type="time" defaultValue={r.start_time?.slice(0,5)} onBlur={(e) => e.target.value !== r.start_time?.slice(0,5) && updateRow(r, 'start_time', e.target.value)} className="w-32" />
                            <span>a</span>
                            <Input type="time" defaultValue={r.end_time?.slice(0,5)} onBlur={(e) => e.target.value !== r.end_time?.slice(0,5) && updateRow(r, 'end_time', e.target.value)} className="w-32" />
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => del(r.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
