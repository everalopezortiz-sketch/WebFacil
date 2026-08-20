'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Users, FilePlus, History, Settings as SettingsIcon, FileText, ArrowLeft, Pencil } from 'lucide-react'
import { authFetch, calcAge, fmtDate } from '@/lib/diagnostics/helpers'
import ClientsList from './ClientsList'
import ClientFormDialog from './ClientFormDialog'
import RecordsList from './RecordsList'
import DiagnosticForm from './DiagnosticForm'
import RecordView from './RecordView'
import DiagnosticSettings from './DiagnosticSettings'
import { toast } from 'sonner'

// Orchestrator for the Fichas capilares module. Loads the catalog and staff
// once, and routes between the sub-views. Egress-friendly: no realtime,
// no polling, compact lists, catalog cached in memory.
export default function DiagnosticsManager({ supabase, profile, userId, businessPhone }) {
  const [view, setView] = useState('clients') // clients | recent | client | record-form | record-view | settings
  const [catalog, setCatalog] = useState(null)
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [clientDialog, setClientDialog] = useState({ open: false, client: null })
  const [activeClient, setActiveClient] = useState(null)
  const [editingRecord, setEditingRecord] = useState(null)
  const [activeRecordId, setActiveRecordId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [catalogDirty, setCatalogDirty] = useState(false)

  useEffect(() => { init() }, [])
  const init = async () => {
    setLoading(true)
    try {
      const [catRes, staffRes] = await Promise.all([
        authFetch(supabase, '/api/diagnostics/catalog'),
        authFetch(supabase, '/api/booking/staff'),
      ])
      const cat = await catRes.json()
      if (catRes.ok) setCatalog(cat)
      const st = await staffRes.json()
      if (staffRes.ok) setStaff((Array.isArray(st) ? st : []).filter(s => s.is_active !== false))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  // Persist a custom option and update the in-memory catalog cache.
  const saveOption = async (field, label) => {
    try {
      const res = await authFetch(supabase, '/api/diagnostics/field-options', { method: 'POST', body: JSON.stringify({ field_id: field.id, label }) })
      const opt = await res.json()
      if (!res.ok) { toast.error(opt.error || 'No se pudo guardar la opción'); return null }
      setCatalog(c => ({ ...c, fields: c.fields.map(f => f.id === field.id ? { ...f, options: [...(f.options || []), opt] } : f) }))
      toast.success('Opción guardada')
      return opt
    } catch { return null }
  }

  const refreshCatalog = async () => {
    try {
      const res = await authFetch(supabase, '/api/diagnostics/catalog')
      const cat = await res.json()
      if (res.ok) setCatalog(cat)
    } catch { /* ignore */ }
  }

  const startNewRecord = async (client) => {
    if (catalogDirty) { await refreshCatalog(); setCatalogDirty(false) }
    setActiveClient(client); setEditingRecord(null); setView('record-form')
  }
  const openRecord = (r) => { setActiveRecordId(r.id); setView('record-view') }
  const editFromView = (bundle) => { setActiveClient(bundle.client); setEditingRecord(bundle); setView('record-form') }
  const afterSave = () => { setRefreshKey(k => k + 1); setView(activeClient ? 'client' : 'recent') }

  const NAV = [
    { key: 'clients', label: 'Clientes', icon: Users },
    { key: 'new', label: 'Nueva ficha', icon: FilePlus },
    { key: 'recent', label: 'Fichas recientes', icon: History },
    { key: 'settings', label: 'Configuración', icon: SettingsIcon },
  ]

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-violet-500" /></div>

  return (
    <div className="space-y-4">
      {/* Sub navigation */}
      {['clients', 'recent', 'settings'].includes(view) && (
        <div className="flex flex-wrap gap-2">
          {NAV.map(n => (
            <Button key={n.key} variant={view === n.key ? 'default' : 'outline'} size="sm"
              className={`gap-2 ${view === n.key ? 'gradient-brand text-white' : ''}`}
              onClick={() => { if (n.key === 'new') { setActiveClient(null); setView('clients'); toast.info('Elegí un cliente para iniciar la ficha, o creá uno nuevo') } else setView(n.key) }}>
              <n.icon className="w-4 h-4" />{n.label}
            </Button>
          ))}
        </div>
      )}

      {view === 'clients' && (
        <ClientsList supabase={supabase}
          onNewClient={() => setClientDialog({ open: true, client: null })}
          onEditClient={c => setClientDialog({ open: true, client: c })}
          onViewClient={c => { setActiveClient(c); setView('client') }}
          onNewRecord={startNewRecord} />
      )}

      {view === 'recent' && <RecordsList supabase={supabase} onView={openRecord} refreshKey={refreshKey} />}

      {view === 'client' && activeClient && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setView('clients')} className="gap-1"><ArrowLeft className="w-4 h-4" />Clientes</Button>
          <Card><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{activeClient.full_name}</h2>
              <p className="text-sm text-muted-foreground">{activeClient.phone || 'Sin tel.'}{activeClient.birth_date ? ` · ${fmtDate(activeClient.birth_date)}${calcAge(activeClient.birth_date) != null ? ` (${calcAge(activeClient.birth_date)} años)` : ''}` : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setClientDialog({ open: true, client: activeClient })}><Pencil className="w-4 h-4" />Editar</Button>
              <Button size="sm" className="gap-1 gradient-brand text-white" onClick={() => startNewRecord(activeClient)}><FilePlus className="w-4 h-4" />Nueva ficha</Button>
            </div>
          </CardContent></Card>
          <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-violet-500" />Fichas del cliente</h3>
          <RecordsList supabase={supabase} clientId={activeClient.id} onView={openRecord} refreshKey={refreshKey} />
        </div>
      )}

      {view === 'record-form' && activeClient && catalog && (
        <DiagnosticForm key={editingRecord?.record?.id ? `edit-${editingRecord.record.id}` : `new-${activeClient.id}-${refreshKey}`}
          supabase={supabase} userId={userId} client={activeClient} catalog={catalog} staff={staff}
          record={editingRecord} mode={editingRecord ? 'edit' : 'new'} onSaveOption={saveOption}
          onCancel={() => setView(activeClient && !editingRecord ? 'client' : 'recent')}
          onSaved={afterSave} />
      )}

      {view === 'record-view' && activeRecordId && (
        <RecordView supabase={supabase} recordId={activeRecordId} businessPhone={businessPhone}
          onBack={() => setView(activeClient ? 'client' : 'recent')} onEdit={editFromView}
          onDeleted={() => { setActiveRecordId(null); setRefreshKey(k => k + 1); setView(activeClient ? 'client' : 'recent') }} />
      )}

      {view === 'settings' && <DiagnosticSettings supabase={supabase} settings={catalog?.settings} onSaved={s => setCatalog(c => ({ ...c, settings: s }))} onFieldsChanged={() => setCatalogDirty(true)} />}

      <ClientFormDialog supabase={supabase} open={clientDialog.open} client={clientDialog.client}
        onOpenChange={o => setClientDialog(d => ({ ...d, open: o }))}
        onSaved={(c) => { setRefreshKey(k => k + 1); if (activeClient && clientDialog.client && c.id === activeClient.id) setActiveClient(c) }} />
    </div>
  )
}
