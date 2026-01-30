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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Settings, Package, ShoppingCart, BarChart3, Globe, LogOut,
  Plus, Pencil, Trash2, Loader2, Image, DollarSign, Tag,
  MessageSquare, Bell, QrCode, Link2, Copy, ExternalLink,
  Calendar, TrendingUp, Users, Store, AlertTriangle, X, Check,
  Phone, Mail, MapPin, CreditCard, Truck, Eye
} from 'lucide-react'

const CURRENCIES = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'PYG', label: 'Guaraní (Gs)', symbol: 'Gs' },
  { value: 'EUR', label: 'Euro (€)', symbol: '€' },
  { value: 'BRL', label: 'Real (R$)', symbol: 'R$' },
  { value: 'ARS', label: 'Peso AR ($)', symbol: '$' },
  { value: 'MXN', label: 'Peso MX ($)', symbol: '$' }
]

// Order status constants (matching database constraint)
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
}

const ORDER_STATUS_LABELS = {
  pending: { label: 'Nuevo', color: 'bg-yellow-500' },
  confirmed: { label: 'Confirmado', color: 'bg-blue-500' },
  preparing: { label: 'Preparando', color: 'bg-orange-500' },
  ready: { label: 'Listo', color: 'bg-cyan-500' },
  delivered: { label: 'Entregado', color: 'bg-green-500' },
  cancelled: { label: 'Cancelado', color: 'bg-red-500' }
}

const BUSINESS_LABELS = {
  ecommerce: { label: 'Tienda', icon: Store, productLabel: 'Productos' },
  personal: { label: 'Personal', icon: Users, productLabel: 'Servicios' },
  restaurant: { label: 'Restaurante', icon: Package, productLabel: 'Menú' }
}

// Helper function for authenticated fetch
async function authFetch(supabase, url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${session?.access_token || ''}`
  }
  return fetch(url, { ...options, headers })
}

export default function Dashboard({ user, profile, onLogout }) {
  const [activeTab, setActiveTab] = useState('settings')
  const [settings, setSettings] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [checkoutFields, setCheckoutFields] = useState([])
  const [messages, setMessages] = useState([])
  const [userPlan, setUserPlan] = useState(null)
  const [infoContent, setInfoContent] = useState([])
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Dialogs
  const [categoryDialog, setCategoryDialog] = useState({ open: false, data: null })
  const [productDialog, setProductDialog] = useState({ open: false, data: null })
  const [fieldDialog, setFieldDialog] = useState({ open: false, data: null })
  
  // Date filters
  const [reportDateRange, setReportDateRange] = useState({ start: '', end: '' })
  const [orderDateFilter, setOrderDateFilter] = useState('')

  const supabase = createClient()
  const businessConfig = BUSINESS_LABELS[profile.business_type] || BUSINESS_LABELS.ecommerce
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const storeUrl = `${baseUrl}/store/${profile.slug}`

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadSettings(),
        loadCategories(),
        loadProducts(),
        loadOrders(),
        loadCheckoutFields(),
        loadMessages(),
        loadUserPlan(),
        loadInfoContent()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSettings = async () => {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const data = await res.json()
      setSettings(data)
    }
  }

  const loadCategories = async () => {
    const res = await fetch('/api/categories')
    if (res.ok) setCategories(await res.json())
  }

  const loadProducts = async () => {
    const res = await fetch('/api/products')
    if (res.ok) setProducts(await res.json())
  }

  const loadOrders = async (date) => {
    const url = date ? `/api/orders?date=${date}` : '/api/orders'
    const res = await fetch(url)
    if (res.ok) setOrders(await res.json())
  }

  const loadCheckoutFields = async () => {
    const res = await fetch('/api/checkout-fields')
    if (res.ok) setCheckoutFields(await res.json())
  }

  const loadMessages = async () => {
    const res = await fetch('/api/messages')
    if (res.ok) setMessages(await res.json())
  }

  const loadUserPlan = async () => {
    const res = await fetch('/api/user-plan')
    if (res.ok) setUserPlan(await res.json())
  }

  const loadInfoContent = async () => {
    const res = await fetch('/api/info-content')
    if (res.ok) setInfoContent(await res.json())
  }

  const loadReports = async () => {
    const params = new URLSearchParams()
    if (reportDateRange.start) params.set('startDate', reportDateRange.start)
    if (reportDateRange.end) params.set('endDate', reportDateRange.end)
    const res = await fetch(`/api/reports?${params}`)
    if (res.ok) setReports(await res.json())
  }

  // Update order status
  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await authFetch(supabase, `/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        toast.success('Estado actualizado')
        loadOrders(orderDateFilter)
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al actualizar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Delete order
  const deleteOrder = async (orderId) => {
    if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return
    try {
      const res = await authFetch(supabase, `/api/orders/${orderId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success('Pedido eliminado')
        loadOrders(orderDateFilter)
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    }
  }

  // Order dialog for editing
  const [orderDialog, setOrderDialog] = useState({ open: false, data: null })

  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const data = await res.json()
      if (res.ok) {
        setSettings(data) // Update with returned data
        toast.success('Configuración guardada')
      } else {
        console.error('Settings error:', data)
        toast.error(data.error || 'Error al guardar')
      }
    } catch (error) {
      console.error('Settings save error:', error)
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // Category CRUD
  const saveCategory = async (data) => {
    setSaving(true)
    try {
      const isEdit = !!data.id
      const res = await fetch(isEdit ? `/api/categories/${data.id}` : '/api/categories', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        toast.success(isEdit ? 'Categoría actualizada' : 'Categoría creada')
        loadCategories()
        setCategoryDialog({ open: false, data: null })
      }
    } catch (error) {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async (id) => {
    if (!confirm('¿Eliminar esta categoría?')) return
    const res = await authFetch(supabase, `/api/categories/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Categoría eliminada')
      loadCategories()
    }
  }

  // Product CRUD
  const saveProduct = async (data) => {
    setSaving(true)
    try {
      const isEdit = !!data.id
      const res = await authFetch(supabase, isEdit ? `/api/products/${data.id}` : '/api/products', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(isEdit ? 'Actualizado' : 'Creado')
        loadProducts()
        setProductDialog({ open: false, data: null })
      } else {
        console.error('Product save error:', result)
        toast.error(result.error || 'Error al guardar')
      }
    } catch (error) {
      console.error('Product save error:', error)
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('¿Eliminar este elemento?')) return
    const res = await authFetch(supabase, `/api/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Eliminado')
      loadProducts()
    }
  }

  // Checkout field CRUD
  const saveCheckoutField = async (data) => {
    setSaving(true)
    try {
      const isEdit = !!data.id
      const res = await authFetch(supabase, isEdit ? `/api/checkout-fields/${data.id}` : '/api/checkout-fields', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        toast.success(isEdit ? 'Campo actualizado' : 'Campo creado')
        loadCheckoutFields()
        setFieldDialog({ open: false, data: null })
      }
    } catch (error) {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const deleteCheckoutField = async (id) => {
    if (!confirm('¿Eliminar este campo?')) return
    const res = await authFetch(supabase, `/api/checkout-fields/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Campo eliminado')
      loadCheckoutFields()
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado al portapapeles')
  }

  const getCurrencySymbol = () => {
    return CURRENCIES.find(c => c.value === settings?.currency)?.symbol || '$'
  }

  const formatPrice = (price) => {
    return `${getCurrencySymbol()} ${parseFloat(price || 0).toLocaleString()}`
  }

  // Check plan expiration
  const getPlanStatus = () => {
    if (!userPlan) return { status: 'none', message: 'Sin plan activo' }
    const endDate = new Date(userPlan.end_date)
    const now = new Date()
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
    
    if (daysLeft < 0) return { status: 'expired', message: 'Plan vencido', daysLeft: 0 }
    if (daysLeft <= 4) return { status: 'warning', message: `Vence en ${daysLeft} días`, daysLeft }
    return { status: 'active', message: `${daysLeft} días restantes`, daysLeft }
  }

  const planStatus = getPlanStatus()

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
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <businessConfig.icon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">{profile.first_name} {profile.last_name}</h1>
              <p className="text-xs text-muted-foreground">{businessConfig.label}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Plan status badge */}
            {planStatus.status !== 'none' && (
              <Badge variant={planStatus.status === 'warning' || planStatus.status === 'expired' ? 'destructive' : 'secondary'}>
                {planStatus.message}
              </Badge>
            )}
            
            {/* Messages indicator */}
            {messages.filter(m => !m.is_read).length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                <Bell className="w-3 h-3 mr-1" />
                {messages.filter(m => !m.is_read).length}
              </Badge>
            )}
            
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Maintenance/Support Messages Alert */}
      {(profile.maintenance_mode || messages.filter(m => !m.is_read).length > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="container mx-auto">
            {profile.maintenance_mode && (
              <div className="flex items-center gap-2 text-amber-800 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Tu sitio está en modo mantenimiento</span>
              </div>
            )}
            {messages.filter(m => !m.is_read).slice(0, 1).map(msg => (
              <div key={msg.id} className="flex items-start gap-2 text-amber-800">
                <MessageSquare className="w-4 h-4 mt-0.5" />
                <span>{msg.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Content */}
      {infoContent.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="container mx-auto flex items-center gap-2 text-blue-800 text-sm">
            <Bell className="w-4 h-4" />
            {infoContent[0].title}
            {infoContent[0].link_url && (
              <a href={infoContent[0].link_url} target="_blank" rel="noopener" className="underline ml-2">
                Ver más
              </a>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" /> Configuración
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <Package className="w-4 h-4" /> {businessConfig.productLabel}
            </TabsTrigger>
            <TabsTrigger value="checkout" className="gap-2">
              <CreditCard className="w-4 h-4" /> Checkout
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="w-4 h-4" /> Pedidos
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <BarChart3 className="w-4 h-4" /> Reportes
            </TabsTrigger>
            <TabsTrigger value="website" className="gap-2">
              <Globe className="w-4 h-4" /> Mi Web
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Appearance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Apariencia</CardTitle>
                  <CardDescription>Personaliza el diseño de tu página</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Logo (URL de imagen)</Label>
                    <Input
                      placeholder="https://ejemplo.com/logo.png"
                      value={settings?.logo_url || ''}
                      onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                    />
                    {settings?.logo_url && (
                      <div className="mt-2 p-2 bg-slate-50 rounded-lg inline-block">
                        <img 
                          src={settings.logo_url} 
                          alt="Vista previa" 
                          className="h-16 w-auto object-contain"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Imagen de Portada (URL)</Label>
                    <Input
                      placeholder="https://ejemplo.com/cover.jpg"
                      value={settings?.cover_image_url || ''}
                      onChange={(e) => setSettings({ ...settings, cover_image_url: e.target.value })}
                    />
                    {settings?.cover_image_url && (
                      <div className="mt-2 rounded-lg overflow-hidden">
                        <img 
                          src={settings.cover_image_url} 
                          alt="Vista previa" 
                          className="h-20 w-full object-cover"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Patrón de Fondo</Label>
                    <Select
                      value={settings?.bg_pattern || 'none'}
                      onValueChange={(v) => setSettings({ ...settings, bg_pattern: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin patrón</SelectItem>
                        <SelectItem value="dots">Puntos</SelectItem>
                        <SelectItem value="lines">Líneas</SelectItem>
                        <SelectItem value="waves">Ondas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Color de fondo</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={settings?.theme_bg_color || '#ffffff'}
                          onChange={(e) => setSettings({ ...settings, theme_bg_color: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={settings?.theme_bg_color || '#ffffff'}
                          onChange={(e) => setSettings({ ...settings, theme_bg_color: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Color de texto</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={settings?.theme_font_color || '#000000'}
                          onChange={(e) => setSettings({ ...settings, theme_font_color: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={settings?.theme_font_color || '#000000'}
                          onChange={(e) => setSettings({ ...settings, theme_font_color: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Color de botones</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={settings?.theme_button_color || '#3b82f6'}
                          onChange={(e) => setSettings({ ...settings, theme_button_color: e.target.value })}
                          className="w-12 h-10 p-1"
                        />
                        <Input
                          value={settings?.theme_button_color || '#3b82f6'}
                          onChange={(e) => setSettings({ ...settings, theme_button_color: e.target.value })}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Diseño de Tarjetas */}
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-base font-semibold">Diseño de Tarjetas</Label>
                    <p className="text-sm text-muted-foreground mb-3">Configura cómo se muestran los productos</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Tamaño</Label>
                        <Select
                          value={settings?.card_size || 'medium'}
                          onValueChange={(v) => setSettings({ ...settings, card_size: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Pequeño</SelectItem>
                            <SelectItem value="medium">Mediano</SelectItem>
                            <SelectItem value="large">Grande</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Columnas</Label>
                        <Select
                          value={String(settings?.grid_columns || '4')}
                          onValueChange={(v) => setSettings({ ...settings, grid_columns: parseInt(v) })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Por página</Label>
                        <Select
                          value={String(settings?.products_per_page || '20')}
                          onValueChange={(v) => setSettings({ ...settings, products_per_page: parseInt(v) })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="12">12</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="30">30</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Business Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuración de Negocio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Descripción de tu negocio</Label>
                    <Textarea
                      placeholder="Describe tu negocio o tienda..."
                      value={settings?.store_description || ''}
                      onChange={(e) => setSettings({ ...settings, store_description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <Label>Horario de Atención</Label>
                    <Textarea
                      placeholder="Lun-Vie: 9am-6pm, Sáb: 9am-1pm"
                      value={settings?.business_hours || ''}
                      onChange={(e) => setSettings({ ...settings, business_hours: e.target.value })}
                      rows={2}
                    />
                  </div>
                  
                  <div>
                    <Label>Políticas de Envío</Label>
                    <Textarea
                      placeholder="Información sobre entregas..."
                      value={settings?.shipping_info || ''}
                      onChange={(e) => setSettings({ ...settings, shipping_info: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Moneda</Label>
                    <Select
                      value={settings?.currency || 'USD'}
                      onValueChange={(v) => setSettings({ ...settings, currency: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Tipo de negocio</Label>
                    <Select
                      value={settings?.business_mode || 'online'}
                      onValueChange={(v) => setSettings({ ...settings, business_mode: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Solo online</SelectItem>
                        <SelectItem value="physical">Tienda física</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {settings?.business_mode === 'physical' && (
                    <div>
                      <Label>Link de ubicación (Google Maps)</Label>
                      <Input
                        placeholder="https://maps.google.com/..."
                        value={settings?.location_link || ''}
                        onChange={(e) => setSettings({ ...settings, location_link: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Delivery</Label>
                      <p className="text-sm text-muted-foreground">Habilitar entregas a domicilio</p>
                    </div>
                    <Switch
                      checked={settings?.delivery_enabled || false}
                      onCheckedChange={(v) => setSettings({ ...settings, delivery_enabled: v })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Payment Methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Métodos de Pago</CardTitle>
                  <CardDescription>Activa o desactiva métodos de pago</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Cash */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Efectivo</Label>
                      <p className="text-sm text-muted-foreground">Pago en efectivo al momento de entrega</p>
                    </div>
                    <Switch
                      checked={settings?.payment_cash_enabled || false}
                      onCheckedChange={(v) => setSettings({ ...settings, payment_cash_enabled: v })}
                    />
                  </div>

                  {/* Bank Transfer */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Transferencia Bancaria</Label>
                      </div>
                      <Switch
                        checked={settings?.payment_bank_enabled !== false && !!settings?.payment_bank_account}
                        onCheckedChange={(v) => setSettings({ ...settings, payment_bank_enabled: v })}
                      />
                    </div>
                    <Textarea
                      placeholder="Banco: ...&#10;Cuenta: ...&#10;Titular: ..."
                      value={settings?.payment_bank_account || ''}
                      onChange={(e) => setSettings({ ...settings, payment_bank_account: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* Payment Link */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Link de Pago (PayPal, MercadoPago, etc)</Label>
                      </div>
                      <Switch
                        checked={settings?.payment_link_enabled !== false && !!settings?.payment_link}
                        onCheckedChange={(v) => setSettings({ ...settings, payment_link_enabled: v })}
                      />
                    </div>
                    <Input
                      placeholder="https://..."
                      value={settings?.payment_link || ''}
                      onChange={(e) => setSettings({ ...settings, payment_link: e.target.value })}
                    />
                  </div>

                  {/* QR Payment */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>QR de Pago</Label>
                      </div>
                      <Switch
                        checked={settings?.payment_qr_enabled !== false && !!settings?.payment_qr_url}
                        onCheckedChange={(v) => setSettings({ ...settings, payment_qr_enabled: v })}
                      />
                    </div>
                    <Input
                      placeholder="https://ejemplo.com/qr.png"
                      value={settings?.payment_qr_url || ''}
                      onChange={(e) => setSettings({ ...settings, payment_qr_url: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* WhatsApp */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">WhatsApp</CardTitle>
                  <CardDescription>Los pedidos se enviarán a este número</CardDescription>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label>Número de WhatsApp</Label>
                    <Input
                      placeholder="+595991123456"
                      value={settings?.whatsapp_number || ''}
                      onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Incluye el código de país sin espacios (ej: +595991123456)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={saveSettings} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Configuración
              </Button>
            </div>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products">
            {/* Categories */}
            <Card className="mb-6">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Categorías</CardTitle>
                  <CardDescription>Organiza tus {businessConfig.productLabel.toLowerCase()}</CardDescription>
                </div>
                <Button size="sm" onClick={() => setCategoryDialog({ open: true, data: { name: '', description: '' } })}>
                  <Plus className="w-4 h-4 mr-2" /> Nueva
                </Button>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No hay categorías aún</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <Badge key={cat.id} variant="secondary" className="px-3 py-1.5 gap-2">
                        {cat.name}
                        <button onClick={() => setCategoryDialog({ open: true, data: cat })}>
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteCategory(cat.id)} className="text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Products */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>{businessConfig.productLabel}</CardTitle>
                </div>
                <Button onClick={() => setProductDialog({ open: true, data: { name: '', description: '', price: '', image_url: '', category_id: 'none', promo_price: '', promo_active: false, is_featured: false, is_active: true } })}>
                  <Plus className="w-4 h-4 mr-2" /> Nuevo
                </Button>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay {businessConfig.productLabel.toLowerCase()} aún</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products.map(product => (
                      <Card key={product.id} className="overflow-hidden">
                        {product.image_url && (
                          <div className="aspect-video bg-slate-100 relative">
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                            {product.promo_active && (
                              <Badge className="absolute top-2 right-2 bg-red-500">Promo</Badge>
                            )}
                            {product.is_featured && (
                              <Badge className="absolute top-2 left-2 bg-amber-500">Destacado</Badge>
                            )}
                          </div>
                        )}
                        <CardContent className="p-4">
                          <h3 className="font-medium truncate">{product.name}</h3>
                          <p className="text-sm text-muted-foreground truncate">{product.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {product.promo_active && product.promo_price ? (
                              <>
                                <span className="font-bold text-red-600">{formatPrice(product.promo_price)}</span>
                                <span className="text-sm text-muted-foreground line-through">{formatPrice(product.price)}</span>
                              </>
                            ) : (
                              <span className="font-bold">{formatPrice(product.price)}</span>
                            )}
                          </div>
                          {product.categories?.name && (
                            <Badge variant="outline" className="mt-2">{product.categories.name}</Badge>
                          )}
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setProductDialog({ open: true, data: product })}>
                              <Pencil className="w-3 h-3 mr-1" /> Editar
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteProduct(product.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Checkout Tab */}
          <TabsContent value="checkout">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Campos de Checkout</CardTitle>
                  <CardDescription>Define qué información solicitar al cliente</CardDescription>
                </div>
                <Button onClick={() => setFieldDialog({ open: true, data: { field_name: '', field_label: '', field_type: 'text', is_required: false, display_order: checkoutFields.length } })}>
                  <Plus className="w-4 h-4 mr-2" /> Nuevo Campo
                </Button>
              </CardHeader>
              <CardContent>
                {checkoutFields.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No hay campos configurados</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Etiqueta</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Requerido</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkoutFields.map(field => (
                        <TableRow key={field.id}>
                          <TableCell className="font-mono text-sm">{field.field_name}</TableCell>
                          <TableCell>{field.field_label}</TableCell>
                          <TableCell><Badge variant="outline">{field.field_type}</Badge></TableCell>
                          <TableCell>{field.is_required ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-muted-foreground" />}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setFieldDialog({ open: true, data: field })}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteCheckoutField(field.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Pedidos</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={orderDateFilter}
                      onChange={(e) => {
                        setOrderDateFilter(e.target.value)
                        loadOrders(e.target.value)
                      }}
                      className="w-auto"
                    />
                    {orderDateFilter && (
                      <Button variant="ghost" size="sm" onClick={() => { setOrderDateFilter(''); loadOrders() }}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Order Status Tabs */}
                <Tabs defaultValue="pending" className="w-full">
                  <TabsList className="grid grid-cols-4 mb-4">
                    <TabsTrigger value="pending" className="text-xs sm:text-sm">
                      Nuevos
                      {orders.filter(o => o.status === 'pending').length > 0 && (
                        <Badge className="ml-1 bg-yellow-500">{orders.filter(o => o.status === 'pending').length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="preparing" className="text-xs sm:text-sm">
                      Preparando
                      {orders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length > 0 && (
                        <Badge className="ml-1 bg-orange-500">{orders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="ready" className="text-xs sm:text-sm">
                      Listo/Delivery
                    </TabsTrigger>
                    <TabsTrigger value="delivered" className="text-xs sm:text-sm">
                      Entregados
                    </TabsTrigger>
                  </TabsList>

                  {/* Pending Orders */}
                  <TabsContent value="pending">
                    {orders.filter(o => o.status === 'pending').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos nuevos</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {orders.filter(o => o.status === 'pending').map(order => (
                            <OrderCard 
                              key={order.id} 
                              order={order} 
                              formatPrice={formatPrice}
                              onView={() => setOrderDialog({ open: true, data: order })}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <>
                                  <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => updateOrderStatus(order.id, 'confirmed')}>
                                    <Check className="w-4 h-4 mr-1" /> Confirmar
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => updateOrderStatus(order.id, 'cancelled')}>
                                    <X className="w-4 h-4 mr-1" /> Cancelar
                                  </Button>
                                </>
                              }
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>

                  {/* Preparing Orders */}
                  <TabsContent value="preparing">
                    {orders.filter(o => o.status === 'preparing' || o.status === 'confirmed').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos en preparación</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {orders.filter(o => o.status === 'preparing' || o.status === 'confirmed').map(order => (
                            <OrderCard 
                              key={order.id} 
                              order={order} 
                              formatPrice={formatPrice}
                              onView={() => setOrderDialog({ open: true, data: order })}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white" onClick={() => updateOrderStatus(order.id, 'ready')}>
                                  <Check className="w-4 h-4 mr-1" /> Listo para Entrega
                                </Button>
                              }
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>

                  {/* Ready Orders */}
                  <TabsContent value="ready">
                    {orders.filter(o => o.status === 'ready').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos listos</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {orders.filter(o => o.status === 'ready').map(order => (
                            <OrderCard 
                              key={order.id} 
                              order={order} 
                              formatPrice={formatPrice}
                              onView={() => setOrderDialog({ open: true, data: order })}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                                  <Truck className="w-4 h-4 mr-1" /> Marcar Entregado
                                </Button>
                              }
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>

                  {/* Delivered Orders */}
                  <TabsContent value="delivered">
                    {orders.filter(o => o.status === 'delivered').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos entregados</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {orders.filter(o => o.status === 'delivered').map(order => (
                            <OrderCard 
                              key={order.id} 
                              order={order} 
                              formatPrice={formatPrice}
                              onView={() => setOrderDialog({ open: true, data: order })}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <Badge className="bg-green-100 text-green-700">✓ Entregado</Badge>
                              }
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle>Reportes</CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={reportDateRange.start}
                      onChange={(e) => setReportDateRange({ ...reportDateRange, start: e.target.value })}
                      className="w-auto"
                    />
                    <span>a</span>
                    <Input
                      type="date"
                      value={reportDateRange.end}
                      onChange={(e) => setReportDateRange({ ...reportDateRange, end: e.target.value })}
                      className="w-auto"
                    />
                    <Button onClick={loadReports}>Generar</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!reports ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Selecciona un rango de fechas y genera el reporte</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <ShoppingCart className="w-4 h-4" />
                            <span className="text-sm">Total Pedidos</span>
                          </div>
                          <p className="text-2xl font-bold">{reports.totalOrders}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-sm">Ingresos</span>
                          </div>
                          <p className="text-2xl font-bold">{formatPrice(reports.totalRevenue)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Top Products */}
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Más Vendidos
                      </h3>
                      {reports.topProducts?.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-right">Cantidad</TableHead>
                              <TableHead className="text-right">Ingresos</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reports.topProducts.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell>{p.name}</TableCell>
                                <TableCell className="text-right">{p.quantity}</TableCell>
                                <TableCell className="text-right">{formatPrice(p.revenue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground">Sin ventas en este período</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Website Tab */}
          <TabsContent value="website">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tu Página Web</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>URL de tu tienda</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={storeUrl} readOnly />
                      <Button variant="outline" onClick={() => copyToClipboard(storeUrl)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={storeUrl} target="_blank" rel="noopener">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Slug personalizado</Label>
                    <Input value={profile.slug} disabled />
                    <p className="text-xs text-muted-foreground mt-1">
                      El slug se genera automáticamente al crear la cuenta
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Código QR</CardTitle>
                  <CardDescription>Comparte tu tienda fácilmente</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-lg border">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(storeUrl)}`}
                      alt="QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                  <Button variant="outline" className="mt-4" asChild>
                    <a href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(storeUrl)}&format=png`} download="qr-code.png">
                      Descargar QR
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Category Dialog */}
      <Dialog open={categoryDialog.open} onOpenChange={(open) => setCategoryDialog({ ...categoryDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog.data?.id ? 'Editar' : 'Nueva'} Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={categoryDialog.data?.name || ''}
                onChange={(e) => setCategoryDialog({ ...categoryDialog, data: { ...categoryDialog.data, name: e.target.value } })}
              />
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={categoryDialog.data?.description || ''}
                onChange={(e) => setCategoryDialog({ ...categoryDialog, data: { ...categoryDialog.data, description: e.target.value } })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCategoryDialog({ open: false, data: null })}>Cancelar</Button>
              <Button onClick={() => saveCategory(categoryDialog.data)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={productDialog.open} onOpenChange={(open) => setProductDialog({ ...productDialog, open })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{productDialog.data?.id ? 'Editar' : 'Nuevo'} {businessConfig.productLabel.slice(0, -1)}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 p-1">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input
                    value={productDialog.data?.name || ''}
                    onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, name: e.target.value } })}
                  />
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select
                    value={productDialog.data?.category_id || ''}
                    onValueChange={(v) => setProductDialog({ ...productDialog, data: { ...productDialog.data, category_id: v } })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={productDialog.data?.description || ''}
                  onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, description: e.target.value } })}
                  rows={3}
                />
              </div>

              <div>
                <Label>Imagen (URL)</Label>
                <Input
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={productDialog.data?.image_url || ''}
                  onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, image_url: e.target.value } })}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Precio *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={productDialog.data?.price || ''}
                    onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, price: e.target.value } })}
                  />
                </div>
                <div>
                  <Label>Precio en promoción</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={productDialog.data?.promo_price || ''}
                    onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, promo_price: e.target.value } })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={productDialog.data?.promo_active || false}
                    onCheckedChange={(v) => setProductDialog({ ...productDialog, data: { ...productDialog.data, promo_active: v } })}
                  />
                  <Label>Promoción activa</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={productDialog.data?.is_featured || false}
                    onCheckedChange={(v) => setProductDialog({ ...productDialog, data: { ...productDialog.data, is_featured: v } })}
                  />
                  <Label>Destacado</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={productDialog.data?.is_active !== false}
                    onCheckedChange={(v) => setProductDialog({ ...productDialog, data: { ...productDialog.data, is_active: v } })}
                  />
                  <Label>Activo</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setProductDialog({ open: false, data: null })}>Cancelar</Button>
                <Button onClick={() => saveProduct(productDialog.data)} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Checkout Field Dialog */}
      <Dialog open={fieldDialog.open} onOpenChange={(open) => setFieldDialog({ ...fieldDialog, open })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{fieldDialog.data?.id ? 'Editar' : 'Nuevo'} Campo</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 p-1">
              <div>
                <Label>Nombre del campo (interno)</Label>
                <Input
                  placeholder="direccion_entrega"
                  value={fieldDialog.data?.field_name || ''}
                  onChange={(e) => setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, field_name: e.target.value.toLowerCase().replace(/\s/g, '_') } })}
                />
              </div>
              <div>
                <Label>Etiqueta (visible al cliente)</Label>
                <Input
                  placeholder="Dirección de entrega"
                  value={fieldDialog.data?.field_label || ''}
                  onChange={(e) => setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, field_label: e.target.value } })}
                />
              </div>
              <div>
                <Label>Tipo de campo</Label>
                <Select
                  value={fieldDialog.data?.field_type || 'text'}
                  onValueChange={(v) => {
                    const newData = { ...fieldDialog.data, field_type: v }
                    // Initialize options for select type
                    if (v === 'select' && (!newData.options || newData.options.length < 2)) {
                      newData.options = ['Opción 1', 'Opción 2']
                    }
                    setFieldDialog({ ...fieldDialog, data: newData })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Teléfono</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="textarea">Área de texto</SelectItem>
                    <SelectItem value="select">Selección Múltiple</SelectItem>
                    <SelectItem value="checkbox">Casilla</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Options for Select type */}
              {fieldDialog.data?.field_type === 'select' && (
                <div className="space-y-2">
                  <Label>Opciones de selección</Label>
                  <p className="text-xs text-muted-foreground">El cliente podrá elegir una o varias opciones</p>
                  {(fieldDialog.data?.options || ['Opción 1', 'Opción 2']).map((option, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={option}
                        onChange={(e) => {
                          const newOptions = [...(fieldDialog.data?.options || ['Opción 1', 'Opción 2'])]
                          newOptions[idx] = e.target.value
                          setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, options: newOptions } })
                        }}
                        placeholder={`Opción ${idx + 1}`}
                      />
                      {(fieldDialog.data?.options || []).length > 2 && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            const newOptions = [...(fieldDialog.data?.options || [])]
                            newOptions.splice(idx, 1)
                            setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, options: newOptions } })
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const newOptions = [...(fieldDialog.data?.options || ['Opción 1', 'Opción 2']), `Opción ${(fieldDialog.data?.options || []).length + 1}`]
                      setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, options: newOptions } })
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Agregar opción
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  checked={fieldDialog.data?.is_required || false}
                  onCheckedChange={(v) => setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, is_required: v } })}
                />
                <Label>Campo requerido</Label>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setFieldDialog({ open: false, data: null })}>Cancelar</Button>
                <Button onClick={() => saveCheckoutField(fieldDialog.data)} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={orderDialog.open} onOpenChange={(open) => setOrderDialog({ ...orderDialog, open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle del Pedido</DialogTitle>
            <DialogDescription>{orderDialog.data?.order_number}</DialogDescription>
          </DialogHeader>
          {orderDialog.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <p className="font-medium">{orderDialog.data.customer_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Teléfono</Label>
                  <p className="font-medium">{orderDialog.data.customer_phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium">{orderDialog.data.customer_email || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fecha</Label>
                  <p className="font-medium">
                    {orderDialog.data.createdAt ? new Date(orderDialog.data.createdAt).toLocaleString('es') : '-'}
                  </p>
                </div>
              </div>
              
              {orderDialog.data.customer_data && Object.keys(orderDialog.data.customer_data).length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Datos Adicionales</Label>
                  <div className="mt-1 p-2 bg-slate-50 rounded text-sm">
                    {Object.entries(orderDialog.data.customer_data).map(([key, value]) => (
                      <p key={key}><strong>{key}:</strong> {value}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-3">
                <Label className="text-xs text-muted-foreground">Productos</Label>
                {orderDialog.data.order_items?.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span>{item.quantity}x {item.product_name}</span>
                    <span>{formatPrice(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatPrice(orderDialog.data.total)}</span>
                </div>
              </div>

              {orderDialog.data.notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notas</Label>
                  <p className="text-sm">{orderDialog.data.notes}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="destructive" onClick={() => { deleteOrder(orderDialog.data.id); setOrderDialog({ open: false, data: null }); }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                </Button>
                <Button variant="outline" onClick={() => setOrderDialog({ open: false, data: null })}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Order Card Component
function OrderCard({ order, formatPrice, onView, onDelete, actions }) {
  const statusConfig = {
    pending: { label: 'Nuevo', color: '#eab308', bgClass: 'bg-yellow-500' },
    confirmed: { label: 'Confirmado', color: '#3b82f6', bgClass: 'bg-blue-500' },
    preparing: { label: 'Preparando', color: '#f97316', bgClass: 'bg-orange-500' },
    ready: { label: 'Listo', color: '#06b6d4', bgClass: 'bg-cyan-500' },
    delivered: { label: 'Entregado', color: '#22c55e', bgClass: 'bg-green-500' },
    cancelled: { label: 'Cancelado', color: '#ef4444', bgClass: 'bg-red-500' }
  }
  
  const config = statusConfig[order.status] || statusConfig.pending

  return (
    <Card className="border-l-4" style={{ borderLeftColor: config.color }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-mono text-sm text-muted-foreground">{order.order_number}</p>
            <p className="font-medium">{order.customer_name}</p>
            {order.customer_phone && <p className="text-sm text-muted-foreground">{order.customer_phone}</p>}
          </div>
          <div className="text-right flex items-start gap-2">
            <Badge className={config.bgClass}>{config.label}</Badge>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onView}>
                <Eye className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {order.createdAt ? new Date(order.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
        <div className="border-t pt-3">
          {order.order_items?.map((item, i) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span>{item.quantity}x {item.product_name}</span>
              <span>{formatPrice(item.subtotal)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t pt-2 mt-2">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t">
          {actions}
        </div>
      </CardContent>
    </Card>
  )
}
