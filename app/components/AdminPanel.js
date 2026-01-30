'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Users, Settings, CreditCard, MessageSquare, LogOut,
  Loader2, Search, Trash2, Ban, CheckCircle, Mail,
  Key, AlertTriangle, Send, Link2, Calendar, Shield,
  Store, User, Utensils, Eye, ExternalLink, Pencil, Plus, Image
} from 'lucide-react'

const BUSINESS_TYPES = [
  { value: 'ecommerce', label: 'Tienda', icon: Store },
  { value: 'personal', label: 'Personal', icon: User },
  { value: 'restaurant', label: 'Restaurante', icon: Utensils }
]

const CURRENCIES = [
  { value: 'USD', label: 'Dólar (USD)', symbol: '$' },
  { value: 'PYG', label: 'Guaraní (PYG)', symbol: 'Gs' },
  { value: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { value: 'BRL', label: 'Real (BRL)', symbol: 'R$' },
  { value: 'ARS', label: 'Peso Argentino (ARS)', symbol: '$' },
  { value: 'MXN', label: 'Peso Mexicano (MXN)', symbol: '$' }
]

export default function AdminPanel({ user, profile, onLogout }) {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [plans, setPlans] = useState([])
  const [infoContent, setInfoContent] = useState(null)
  const [allInfoContent, setAllInfoContent] = useState([])
  const [sentMessages, setSentMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Software settings
  const [softwareSettings, setSoftwareSettings] = useState({
    name: 'WebBuilder',
    logo_url: '',
    default_currency: 'USD',
    whatsapp_number: ''
  })
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  
  // Dialogs
  const [userDialog, setUserDialog] = useState({ open: false, user: null })
  const [planDialog, setPlanDialog] = useState({ open: false, user: null })
  const [messageDialog, setMessageDialog] = useState({ open: false, user: null, isGlobal: false })
  const [editPlanDialog, setEditPlanDialog] = useState({ open: false, plan: null })
  const [userMessagesDialog, setUserMessagesDialog] = useState({ open: false, user: null, messages: [] })
  
  // Message form
  const [messageText, setMessageText] = useState('')
  
  const supabase = createClient()
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    loadData()
    loadSoftwareSettings()
  }, [])

  useEffect(() => {
    loadUsers()
  }, [searchQuery, typeFilter])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadUsers(), loadPlans(), loadInfoContent(), loadSentMessages()])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    const params = new URLSearchParams()
    if (searchQuery) params.set('search', searchQuery)
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
    
    const res = await fetch(`/api/admin/users?${params}`)
    if (res.ok) setUsers(await res.json())
  }

  const loadPlans = async () => {
    const res = await fetch('/api/plans')
    if (res.ok) setPlans(await res.json())
  }

  const loadInfoContent = async () => {
    const res = await fetch('/api/info-content')
    if (res.ok) {
      const data = await res.json()
      setAllInfoContent(data || [])
      setInfoContent(data[0] || { title: '', link_url: '', description: '' })
    }
  }

  const loadSentMessages = async () => {
    const res = await fetch('/api/admin/messages-list')
    if (res.ok) {
      setSentMessages(await res.json())
    }
  }

  const loadSoftwareSettings = async () => {
    // First try localStorage for immediate display
    const saved = localStorage.getItem('softwareSettings')
    if (saved) {
      try { setSoftwareSettings(JSON.parse(saved)) } catch (e) {}
    }
    
    // Then fetch from API for latest values
    try {
      const res = await fetch('/api/global-settings')
      if (res.ok) {
        const data = await res.json()
        if (data && Object.keys(data).length > 0) {
          setSoftwareSettings(prev => ({ ...prev, ...data }))
          // Update localStorage too
          localStorage.setItem('softwareSettings', JSON.stringify({ ...JSON.parse(saved || '{}'), ...data }))
        }
      }
    } catch (e) {
      console.log('Could not fetch global settings from API')
    }
  }

  const saveSoftwareSettings = async () => {
    // Save to localStorage for immediate use
    localStorage.setItem('softwareSettings', JSON.stringify(softwareSettings))
    
    // Also try to save to API for persistence across sessions/users
    try {
      await fetch('/api/admin/global-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(softwareSettings)
      })
    } catch (e) {
      console.log('Could not save to API, using localStorage only')
    }
    
    toast.success('Configuración del software guardada')
  }

  // Update user
  const updateUser = async (userId, updates) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates })
      })
      if (res.ok) {
        toast.success('Usuario actualizado')
        loadUsers()
        setUserDialog({ open: false, user: null })
      } else {
        toast.error('Error al actualizar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Delete user
  const deleteUser = async (userId) => {
    if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) return
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Usuario eliminado')
        loadUsers()
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Assign plan
  const assignPlan = async (userId, planId, autoRenew) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/assign-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planId, autoRenew })
      })
      if (res.ok) {
        toast.success('Plan asignado')
        loadUsers()
        setPlanDialog({ open: false, user: null })
      } else {
        toast.error('Error al asignar plan')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Update plan
  const updatePlan = async () => {
    if (!editPlanDialog.plan) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/plans/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPlanDialog.plan)
      })
      if (res.ok) {
        toast.success('Plan actualizado')
        loadPlans()
        setEditPlanDialog({ open: false, plan: null })
      } else {
        toast.error('Error al actualizar plan')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Send message
  const sendMessage = async () => {
    if (!messageText.trim()) return
    
    setSaving(true)
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: messageDialog.isGlobal ? null : messageDialog.user?.id,
          message: messageText,
          is_global: messageDialog.isGlobal
        })
      })
      if (res.ok) {
        toast.success('Mensaje enviado')
        setMessageDialog({ open: false, user: null, isGlobal: false })
        setMessageText('')
        loadSentMessages()
      } else {
        toast.error('Error al enviar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Delete message
  const deleteMessage = async (messageId) => {
    if (!confirm('¿Eliminar este mensaje?')) return
    
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Mensaje eliminado')
        loadSentMessages()
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Delete info content
  const deleteInfoContent = async (contentId) => {
    if (!confirm('¿Eliminar este contenido?')) return
    
    try {
      const res = await fetch(`/api/admin/info-content/${contentId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Contenido eliminado')
        loadInfoContent()
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Load messages for specific user
  const loadUserMessages = async (targetUser) => {
    try {
      // Get ALL messages sent to this user (not global ones)
      const res = await fetch(`/api/admin/messages-list`)
      if (res.ok) {
        const allMessages = await res.json()
        // Filter only messages specifically sent to this user
        const userMessages = allMessages.filter(m => m.user_id === targetUser.id && !m.is_global)
        setUserMessagesDialog({ open: true, user: targetUser, messages: userMessages })
      } else {
        setUserMessagesDialog({ open: true, user: targetUser, messages: [] })
      }
    } catch (error) {
      console.error('Error loading messages:', error)
      setUserMessagesDialog({ open: true, user: targetUser, messages: [] })
    }
  }

  // Delete user message
  const deleteUserMessage = async (messageId) => {
    if (!confirm('¿Eliminar este mensaje?')) return
    
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Mensaje eliminado')
        // Refresh messages
        if (userMessagesDialog.user) {
          loadUserMessages(userMessagesDialog.user)
        }
        loadSentMessages()
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Edit message state
  const [editingMessage, setEditingMessage] = useState(null)
  const [editMessageText, setEditMessageText] = useState('')

  // Update/Edit message
  const updateMessage = async (messageId, newText) => {
    if (!newText.trim()) return
    
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newText })
      })
      if (res.ok) {
        toast.success('Mensaje actualizado')
        setEditingMessage(null)
        setEditMessageText('')
        // Refresh lists
        if (userMessagesDialog.user) {
          loadUserMessages(userMessagesDialog.user)
        }
        loadSentMessages()
      } else {
        toast.error('Error al actualizar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Save info content
  const saveInfoContent = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/info-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(infoContent)
      })
      if (res.ok) {
        toast.success('Contenido guardado')
      } else {
        toast.error('Error al guardar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const getBusinessIcon = (type) => {
    const config = BUSINESS_TYPES.find(t => t.value === type)
    if (!config) return Store
    return config.icon
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const getPlanStatus = (userPlans) => {
    const activePlan = userPlans?.find(p => p.is_active)
    if (!activePlan) return { status: 'none', text: 'Sin plan', variant: 'secondary' }
    
    const endDate = new Date(activePlan.end_date)
    const now = new Date()
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
    
    if (daysLeft < 0) return { status: 'expired', text: 'Vencido', variant: 'destructive' }
    if (daysLeft <= 4) return { status: 'warning', text: `${daysLeft}d restantes`, variant: 'destructive' }
    return { status: 'active', text: activePlan.plans?.name || 'Activo', variant: 'default' }
  }

  const getCurrencySymbol = (code) => {
    return CURRENCIES.find(c => c.value === code)?.symbol || '$'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {softwareSettings.logo_url ? (
              <img src={softwareSettings.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-contain" />
            ) : (
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-semibold">{softwareSettings.name || 'WebBuilder'}</h1>
              <p className="text-xs text-slate-400">Panel de Administración</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{profile.email}</span>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-slate-300 hover:text-white hover:bg-slate-800">
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CreditCard className="w-4 h-4" /> Planes
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-2">
              <Link2 className="w-4 h-4" /> Contenido
            </TabsTrigger>
            <TabsTrigger value="software" className="gap-2">
              <Settings className="w-4 h-4" /> Software
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Gestión de Usuarios</CardTitle>
                    <CardDescription>{users.length} usuarios registrados</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setMessageDialog({ open: true, user: null, isGlobal: true })}>
                      <Send className="w-4 h-4 mr-2" /> Mensaje Global
                    </Button>
                  </div>
                </div>
                
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Tipo de cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {BUSINESS_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Registro</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.filter(u => u.role !== 'DESARROLLADOR').map(u => {
                        const BusinessIcon = getBusinessIcon(u.business_type)
                        const planStatus = getPlanStatus(u.user_plans)
                        
                        return (
                          <TableRow key={u.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{u.first_name} {u.last_name}</p>
                                <p className="text-sm text-muted-foreground">{u.email}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1">
                                <BusinessIcon className="w-3 h-3" />
                                {BUSINESS_TYPES.find(t => t.value === u.business_type)?.label || u.business_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={planStatus.variant}>{planStatus.text}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {u.is_active ? (
                                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 w-fit">
                                    <CheckCircle className="w-3 h-3 mr-1" /> Activo
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="w-fit">
                                    <Ban className="w-3 h-3 mr-1" /> Inactivo
                                  </Badge>
                                )}
                                {u.maintenance_mode && (
                                  <Badge variant="secondary" className="w-fit">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Mantenimiento
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(u.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" title="Ver tienda" asChild>
                                  <a href={`${baseUrl}/store/${u.slug}`} target="_blank" rel="noopener">
                                    <Eye className="w-4 h-4" />
                                  </a>
                                </Button>
                                <Button size="sm" variant="ghost" title="Editar" onClick={() => setUserDialog({ open: true, user: u })}>
                                  <Settings className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Asignar plan" onClick={() => setPlanDialog({ open: true, user: u })}>
                                  <CreditCard className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Ver/Enviar Mensajes" onClick={() => loadUserMessages(u)}>
                                  <MessageSquare className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" title="Eliminar" onClick={() => deleteUser(u.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Plans Tab */}
          <TabsContent value="plans">
            <Card>
              <CardHeader>
                <CardTitle>Gestión de Planes</CardTitle>
                <CardDescription>Edita los precios y configuración de los planes de suscripción</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {plans.map(plan => (
                    <Card key={plan.id} className="relative">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="absolute top-2 right-2"
                        onClick={() => setEditPlanDialog({ open: true, plan: { ...plan } })}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <CardHeader>
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        <CardDescription>{plan.duration_days} días</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">
                          {getCurrencySymbol(softwareSettings.default_currency)} {plan.price}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {plan.is_active ? 'Activo' : 'Inactivo'}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Info Content Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Contenido Informativo</CardTitle>
                  <CardDescription>Este contenido se muestra en el dashboard de todos los usuarios</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Título del anuncio</Label>
                    <Input
                      placeholder="Ej: Nueva función disponible"
                      value={infoContent?.title || ''}
                      onChange={(e) => setInfoContent({ ...infoContent, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Link explicativo (opcional)</Label>
                    <Input
                      placeholder="https://..."
                      value={infoContent?.link_url || ''}
                      onChange={(e) => setInfoContent({ ...infoContent, link_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Descripción (opcional)</Label>
                    <Textarea
                      placeholder="Más detalles..."
                      value={infoContent?.description || ''}
                      onChange={(e) => setInfoContent({ ...infoContent, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={infoContent?.is_active !== false}
                      onCheckedChange={(v) => setInfoContent({ ...infoContent, is_active: v })}
                    />
                    <Label>Mostrar a usuarios</Label>
                  </div>
                  <Button onClick={saveInfoContent} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Guardar Contenido
                  </Button>
                </CardContent>
              </Card>

              {/* Sent Messages Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Mensajes Enviados</CardTitle>
                  <CardDescription>Historial de mensajes de soporte</CardDescription>
                </CardHeader>
                <CardContent>
                  {sentMessages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No hay mensajes enviados</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {sentMessages.map(msg => (
                          <div key={msg.id} className="p-3 border rounded-lg bg-slate-50">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {msg.is_global ? (
                                    <Badge variant="secondary">Global</Badge>
                                  ) : (
                                    <Badge variant="outline">Individual</Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                                  </span>
                                </div>
                                <p className="text-sm">{msg.message}</p>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive shrink-0"
                                onClick={() => deleteMessage(msg.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Software Settings Tab */}
          <TabsContent value="software">
            <Card>
              <CardHeader>
                <CardTitle>Configuración del Software</CardTitle>
                <CardDescription>Personaliza el nombre y logo de la plataforma</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Nombre del Software</Label>
                      <Input
                        placeholder="WebBuilder"
                        value={softwareSettings.name}
                        onChange={(e) => setSoftwareSettings({ ...softwareSettings, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Logo (URL de imagen)</Label>
                      <Input
                        placeholder="https://ejemplo.com/logo.png"
                        value={softwareSettings.logo_url}
                        onChange={(e) => setSoftwareSettings({ ...softwareSettings, logo_url: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>WhatsApp de Contacto</Label>
                      <Input
                        placeholder="+595991234567"
                        value={softwareSettings.whatsapp_number || ''}
                        onChange={(e) => setSoftwareSettings({ ...softwareSettings, whatsapp_number: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Aparecerá en el footer de las tiendas y en la pantalla de login</p>
                    </div>
                    <div>
                      <Label>Moneda por defecto</Label>
                      <Select
                        value={softwareSettings.default_currency}
                        onValueChange={(v) => setSoftwareSettings({ ...softwareSettings, default_currency: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label} ({c.symbol})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-center p-8 bg-slate-100 rounded-lg">
                    <div className="text-center">
                      {softwareSettings.logo_url ? (
                        <img 
                          src={softwareSettings.logo_url} 
                          alt="Preview" 
                          className="w-24 h-24 object-contain mx-auto mb-4"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-slate-300 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <Image className="w-12 h-12 text-slate-500" />
                        </div>
                      )}
                      <h3 className="font-bold text-xl">{softwareSettings.name || 'WebBuilder'}</h3>
                      <p className="text-sm text-muted-foreground">Vista previa</p>
                    </div>
                  </div>
                </div>
                <Button onClick={saveSoftwareSettings}>
                  Guardar Configuración
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* User Edit Dialog */}
      <Dialog open={userDialog.open} onOpenChange={(open) => setUserDialog({ ...userDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>{userDialog.user?.email}</DialogDescription>
          </DialogHeader>
          {userDialog.user && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre</Label>
                  <Input value={userDialog.user.first_name} disabled />
                </div>
                <div>
                  <Label>Apellido</Label>
                  <Input value={userDialog.user.last_name} disabled />
                </div>
              </div>
              
              <div>
                <Label>Email</Label>
                <Input
                  value={userDialog.user.email}
                  onChange={(e) => setUserDialog({ ...userDialog, user: { ...userDialog.user, email: e.target.value } })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Estado de cuenta</Label>
                  <p className="text-sm text-muted-foreground">Activar o desactivar usuario</p>
                </div>
                <Switch
                  checked={userDialog.user.is_active}
                  onCheckedChange={(v) => setUserDialog({ ...userDialog, user: { ...userDialog.user, is_active: v } })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Modo Mantenimiento</Label>
                  <p className="text-sm text-muted-foreground">La tienda mostrará mensaje de mantenimiento</p>
                </div>
                <Switch
                  checked={userDialog.user.maintenance_mode}
                  onCheckedChange={(v) => setUserDialog({ ...userDialog, user: { ...userDialog.user, maintenance_mode: v } })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setUserDialog({ open: false, user: null })}>Cancelar</Button>
                <Button
                  onClick={() => updateUser(userDialog.user.id, {
                    email: userDialog.user.email,
                    is_active: userDialog.user.is_active,
                    maintenance_mode: userDialog.user.maintenance_mode
                  })}
                  disabled={saving}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Plan Assignment Dialog */}
      <Dialog open={planDialog.open} onOpenChange={(open) => setPlanDialog({ ...planDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Plan</DialogTitle>
            <DialogDescription>
              {planDialog.user?.first_name} {planDialog.user?.last_name}
            </DialogDescription>
          </DialogHeader>
          {planDialog.user && (
            <div className="space-y-4">
              <div>
                <Label>Seleccionar Plan</Label>
                <Select
                  value={planDialog.selectedPlan || ''}
                  onValueChange={(v) => setPlanDialog({ ...planDialog, selectedPlan: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar plan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - {getCurrencySymbol(softwareSettings.default_currency)}{plan.price} ({plan.duration_days} días)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={planDialog.autoRenew || false}
                  onCheckedChange={(v) => setPlanDialog({ ...planDialog, autoRenew: v })}
                />
                <Label>Renovación automática</Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setPlanDialog({ open: false, user: null })}>Cancelar</Button>
                <Button
                  onClick={() => assignPlan(planDialog.user.id, planDialog.selectedPlan, planDialog.autoRenew)}
                  disabled={saving || !planDialog.selectedPlan}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Asignar Plan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={editPlanDialog.open} onOpenChange={(open) => setEditPlanDialog({ ...editPlanDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Plan</DialogTitle>
          </DialogHeader>
          {editPlanDialog.plan && (
            <div className="space-y-4">
              <div>
                <Label>Nombre del Plan</Label>
                <Input
                  value={editPlanDialog.plan.name}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, plan: { ...editPlanDialog.plan, name: e.target.value } })}
                />
              </div>
              <div>
                <Label>Duración (días)</Label>
                <Input
                  type="number"
                  value={editPlanDialog.plan.duration_days}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, plan: { ...editPlanDialog.plan, duration_days: parseInt(e.target.value) } })}
                />
              </div>
              <div>
                <Label>Precio</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPlanDialog.plan.price}
                  onChange={(e) => setEditPlanDialog({ ...editPlanDialog, plan: { ...editPlanDialog.plan, price: parseFloat(e.target.value) } })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editPlanDialog.plan.is_active}
                  onCheckedChange={(v) => setEditPlanDialog({ ...editPlanDialog, plan: { ...editPlanDialog.plan, is_active: v } })}
                />
                <Label>Plan activo</Label>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditPlanDialog({ open: false, plan: null })}>Cancelar</Button>
                <Button onClick={updatePlan} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <Dialog open={messageDialog.open} onOpenChange={(open) => setMessageDialog({ ...messageDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {messageDialog.isGlobal ? 'Mensaje Global' : 'Mensaje de Soporte'}
            </DialogTitle>
            <DialogDescription>
              {messageDialog.isGlobal 
                ? 'Este mensaje se mostrará a todos los usuarios'
                : `Para: ${messageDialog.user?.first_name} ${messageDialog.user?.last_name}`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mensaje</Label>
              <Textarea
                placeholder="Escribe tu mensaje..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setMessageDialog({ open: false, user: null, isGlobal: false }); setMessageText('') }}>
                Cancelar
              </Button>
              <Button onClick={sendMessage} disabled={saving || !messageText.trim()}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Messages Dialog */}
      <Dialog open={userMessagesDialog.open} onOpenChange={(open) => { setUserMessagesDialog({ ...userMessagesDialog, open }); setEditingMessage(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensajes de {userMessagesDialog.user?.first_name} {userMessagesDialog.user?.last_name}</DialogTitle>
            <DialogDescription>{userMessagesDialog.user?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {userMessagesDialog.messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No hay mensajes enviados a este usuario</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {userMessagesDialog.messages.map(msg => (
                    <div key={msg.id} className="p-3 border rounded-lg bg-slate-50">
                      {editingMessage === msg.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editMessageText}
                            onChange={(e) => setEditMessageText(e.target.value)}
                            rows={3}
                            className="w-full"
                          />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => { setEditingMessage(null); setEditMessageText(''); }}>
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={() => updateMessage(msg.id, editMessageText)} disabled={saving}>
                              {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                              Guardar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline">Individual</Badge>
                              <span className="text-xs text-muted-foreground">
                                {msg.created_at ? new Date(msg.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-sm">{msg.message}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => { setEditingMessage(msg.id); setEditMessageText(msg.message); }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deleteUserMessage(msg.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <div className="flex justify-between border-t pt-4">
              <Button 
                variant="outline"
                onClick={() => {
                  setUserMessagesDialog({ open: false, user: null, messages: [] })
                  setMessageDialog({ open: true, user: userMessagesDialog.user, isGlobal: false })
                }}
              >
                <Send className="w-4 h-4 mr-2" /> Nuevo Mensaje
              </Button>
              <Button variant="outline" onClick={() => setUserMessagesDialog({ open: false, user: null, messages: [] })}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
