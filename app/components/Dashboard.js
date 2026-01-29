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

const BUSINESS_LABELS = {
  ecommerce: { label: 'Tienda', icon: Store, productLabel: 'Productos' },
  personal: { label: 'Personal', icon: Users, productLabel: 'Servicios' },
  restaurant: { label: 'Restaurante', icon: Package, productLabel: 'Menú' }
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

  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (res.ok) {
        toast.success('Configuración guardada')
      } else {
        toast.error('Error al guardar')
      }
    } catch (error) {
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
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
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
      const res = await fetch(isEdit ? `/api/products/${data.id}` : '/api/products', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        toast.success(isEdit ? 'Actualizado' : 'Creado')
        loadProducts()
        setProductDialog({ open: false, data: null })
      }
    } catch (error) {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('¿Eliminar este elemento?')) return
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
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
      const res = await fetch(isEdit ? `/api/checkout-fields/${data.id}` : '/api/checkout-fields', {
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
    const res = await fetch(`/api/checkout-fields/${id}`, { method: 'DELETE' })
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
                </CardContent>
              </Card>

              {/* Business Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuración de Negocio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Cuenta Bancaria</Label>
                    <Textarea
                      placeholder="Banco: ...&#10;Cuenta: ...&#10;Titular: ..."
                      value={settings?.payment_bank_account || ''}
                      onChange={(e) => setSettings({ ...settings, payment_bank_account: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Link de Pago (PayPal, MercadoPago, etc)</Label>
                    <Input
                      placeholder="https://..."
                      value={settings?.payment_link || ''}
                      onChange={(e) => setSettings({ ...settings, payment_link: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>QR de Pago (URL de imagen)</Label>
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
                <Button onClick={() => setProductDialog({ open: true, data: { name: '', description: '', price: '', image_url: '', category_id: '', promo_price: '', promo_active: false, is_featured: false, is_active: true } })}>
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
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay pedidos {orderDateFilter ? 'en esta fecha' : 'aún'}</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {orders.map(order => (
                        <Card key={order.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-mono text-sm text-muted-foreground">{order.order_number}</p>
                                <p className="font-medium">{order.customer_name}</p>
                                {order.customer_phone && <p className="text-sm text-muted-foreground">{order.customer_phone}</p>}
                              </div>
                              <div className="text-right">
                                <Badge>{order.status}</Badge>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {new Date(order.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
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
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fieldDialog.data?.id ? 'Editar' : 'Nuevo'} Campo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                onValueChange={(v) => setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, field_type: v } })}
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
                  <SelectItem value="select">Selección</SelectItem>
                  <SelectItem value="checkbox">Casilla</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={fieldDialog.data?.is_required || false}
                onCheckedChange={(v) => setFieldDialog({ ...fieldDialog, data: { ...fieldDialog.data, is_required: v } })}
              />
              <Label>Campo requerido</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFieldDialog({ open: false, data: null })}>Cancelar</Button>
              <Button onClick={() => saveCheckoutField(fieldDialog.data)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
