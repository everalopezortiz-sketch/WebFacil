'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, Eye } from 'lucide-react'
import { authFetch, fmtDate, STATUS_LABELS } from '@/lib/diagnostics/helpers'

// Compact records list. Optional clientId filter. Cursor pagination (record_number).
export default function RecordsList({ supabase, clientId, onView, refreshKey }) {
  const [records, setRecords] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)

  const load = useCallback(async (cur) => {
    cur ? setMore(true) : setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientId) params.set('client_id', clientId)
      if (cur) params.set('cursor', cur)
      const res = await authFetch(supabase, `/api/diagnostics/records?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setRecords(prev => cur ? [...prev, ...(data.records || [])] : (data.records || []))
        setCursor(data.nextCursor || null)
      }
    } finally { cur ? setMore(false) : setLoading(false) }
  }, [supabase, clientId])

  useEffect(() => { load(null) }, [load, refreshKey])

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
  if (records.length === 0) return <Card><CardContent className="py-10 text-center text-muted-foreground"><FileText className="w-9 h-9 mx-auto mb-2 opacity-40" /><p>Aún no hay fichas.</p></CardContent></Card>

  return (
    <div className="grid gap-2">
      {records.map(r => {
        const st = STATUS_LABELS[r.status] || STATUS_LABELS.draft
        return (
          <Card key={r.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">#{r.record_number}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.client_full_name_snapshot || 'Cliente'}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(r.diagnostic_date)}{r.professional_name_snapshot ? ` · ${r.professional_name_snapshot}` : ''}</p>
              </div>
              <Badge className={st.cls}>{st.label}</Badge>
              <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => onView(r)}><Eye className="w-4 h-4" /><span className="hidden sm:inline">Ver</span></Button>
            </CardContent>
          </Card>
        )
      })}
      {cursor && <Button variant="outline" onClick={() => load(cursor)} disabled={more}>{more && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Cargar más</Button>}
    </div>
  )
}
