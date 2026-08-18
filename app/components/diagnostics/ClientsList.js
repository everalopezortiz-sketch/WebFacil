'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Plus, FilePlus, Pencil, Eye, Loader2, UserRound, Phone } from 'lucide-react'
import { authFetch, calcAge, fmtDate } from '@/lib/diagnostics/helpers'

// Compact clients list: debounced search (400ms), AbortController, cursor pagination.
export default function ClientsList({ supabase, onNewClient, onEditClient, onViewClient, onNewRecord }) {
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const abortRef = useRef(null)
  const lastQuery = useRef(null)

  const load = useCallback(async (q, cur) => {
    // avoid repeating identical empty/same requests
    const key = `${q}|${cur || ''}`
    if (!cur && lastQuery.current === key && clients.length) return
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController(); abortRef.current = ac
    cur ? setLoadingMore(true) : setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (cur) { params.set('cursor_created_at', cur.created_at); params.set('cursor_id', cur.id) }
      const res = await authFetch(supabase, `/api/diagnostics/clients?${params.toString()}`, { signal: ac.signal })
      const data = await res.json()
      if (!res.ok) return
      lastQuery.current = key
      setClients(prev => cur ? [...prev, ...(data.clients || [])] : (data.clients || []))
      setCursor(data.nextCursor || null)
    } catch (e) { if (e.name !== 'AbortError') { /* ignore */ } }
    finally { cur ? setLoadingMore(false) : setLoading(false) }
  }, [supabase, clients.length])

  // debounce search
  useEffect(() => {
    const q = query.trim()
    if (q.length === 1) return // start from 2 chars
    const h = setTimeout(() => { setCursor(null); load(q, null) }, 400)
    return () => clearTimeout(h)
  }, [query, load])

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort() }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nombre o teléfono..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <Button onClick={onNewClient} className="gradient-brand text-white gap-2"><Plus className="w-4 h-4" />Nuevo cliente</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
      ) : clients.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <UserRound className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>{query ? 'Sin resultados' : 'Aún no hay clientes. Creá el primero.'}</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {clients.map(c => {
            const age = calcAge(c.birth_date)
            return (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold flex-shrink-0">{(c.full_name || '?').charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.full_name}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      {age != null && <span>{age} años</span>}
                      <span>Última ficha: {c.last_diagnostic_at ? fmtDate(c.last_diagnostic_at) : '—'}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => onViewClient(c)}><Eye className="w-4 h-4" /><span className="hidden sm:inline">Ver</span></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEditClient(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" className="h-8 gap-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onNewRecord(c)}><FilePlus className="w-4 h-4" /><span className="hidden sm:inline">Ficha</span></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {cursor && (
            <Button variant="outline" onClick={() => load(query.trim(), cursor)} disabled={loadingMore} className="mt-2">
              {loadingMore && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Cargar más
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
