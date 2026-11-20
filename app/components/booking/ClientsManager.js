'use client'

import { useEffect, useState } from 'react'
import { History, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authFetch } from '@/lib/booking/client'
import ClientFormDialog from './ClientFormDialog'

const PAGE_SIZE = 30

export default function ClientsManager({ supabase, onHistory }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editor, setEditor] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query.trim(), offset: page * PAGE_SIZE, limit: PAGE_SIZE })
    setError(false)
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(supabase, '/api/booking/clients?' + params, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error()
        const result = await res.json()
        if (!controller.signal.aborted) setData(result)
      } catch {
        if (!controller.signal.aborted) setError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 280)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [supabase, query, page, revision])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input className="flex-1 min-w-36 max-w-sm" aria-label="Buscar clientes" placeholder="Buscar por nombre o teléfono"
          value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} />
        <Button className="gap-1.5" onClick={() => setEditor({})}><Plus className="size-4" />Nuevo cliente</Button>
      </div>
      {error ? (
        <p className="text-sm" role="alert">No se pudieron cargar los clientes. <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-4"><Loader2 className="size-4 animate-spin" />Cargando clientes...</p>
      ) : data?.clients.length ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.clients.map(client => (
            <Card key={client.id}>
              <CardContent className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium break-words">{client.full_name}</h3>
                  <p className="text-xs text-muted-foreground">{client.phone || 'Sin teléfono'}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => onHistory(client)}><History className="size-4" />Servicios</Button>
                  <Button variant="ghost" size="icon" className="size-9" aria-label={'Editar ' + client.full_name} onClick={() => setEditor({ client })}><Pencil className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">{query ? 'No se encontraron clientes.' : 'Todavía no hay clientes registrados.'}</p>
      )}
      {(page > 0 || data?.hasMore) && <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Anteriores</Button>
        <Button variant="outline" size="sm" disabled={loading || !data?.hasMore} onClick={() => setPage(value => value + 1)}>Siguientes</Button>
      </div>}
      <ClientFormDialog supabase={supabase} open={!!editor} client={editor?.client} onOpenChange={open => { if (!open) setEditor(null) }}
        onSaved={() => { setPage(0); setRevision(value => value + 1) }} />
    </section>
  )
}
