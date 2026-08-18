'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { normalizeImageSrc, parseImages, serializeImages } from '@/lib/imageUtils'
import ImageUpload from '@/components/ImageUpload'
import OrderReceipt from '@/components/OrderReceipt'
import BookingManager from '@/app/components/booking/BookingManager'
import DiagnosticsManager from '@/app/components/diagnostics/DiagnosticsManager'
import { hasBookings } from '@/lib/business'
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
  Phone, Mail, MapPin, CreditCard, Truck, Eye, FileText, Boxes, Home, Lock, CalendarDays
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
  booking: { label: 'Agendamientos + Tienda', icon: CalendarDays, productLabel: 'Productos' },
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
  const [activeTab, setActiveTab] = useState('inicio')
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
  
  // Date filters - default to today
  const today = new Date().toISOString().split('T')[0]
  const [reportDateRange, setReportDateRange] = useState({ start: today, end: today })
  const [orderDateFilter, setOrderDateFilter] = useState('')

  const supabase = createClient()
  const businessConfig = BUSINESS_LABELS[profile.business_type] || BUSINESS_LABELS.ecommerce
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const storeUrl = `${baseUrl}/s/${profile.slug}`

  useEffect(() => {
    loadAllData()
    migrateLegacyImages()
  }, [])

  // One-time (per browser session) migration of legacy base64 images
  // to the Supabase Storage bucket via the pre-deployed edge function.
  const migrateLegacyImages = async () => {
    try {
      if (typeof window === 'undefined') return
      if (sessionStorage.getItem('img_migration_done') === '1') return

      let productsChanged = false
      for (let i = 0; i < 40; i++) {
        const { data, error } = await supabase.functions.invoke('migrate-my-inline-images', { body: {} })
        if (error) {
          console.warn('Image migration error:', error?.message || error)
          break
        }
        if (data?.migrated > 0) productsChanged = true
        const remaining = data?.remainingProducts ?? data?.remaining ?? 0
        if (!remaining || remaining <= 0) break
      }

      sessionStorage.setItem('img_migration_done', '1')
      // Refresh products so the freshly migrated storage URLs are shown
      if (productsChanged) loadProducts()
    } catch (e) {
      console.warn('Image migration skipped:', e?.message || e)
    }
  }

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
        loadInfoContent(),
        loadStats(),
        loadMaterials()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSettings = async () => {
    const res = await authFetch(supabase, '/api/settings')
    if (res.ok) {
      const data = await res.json()
      setSettings(data)
    }
  }

  const loadCategories = async () => {
    const res = await authFetch(supabase, '/api/categories')
    if (res.ok) setCategories(await res.json())
  }

  const loadProducts = async () => {
    const res = await authFetch(supabase, '/api/products')
    if (res.ok) setProducts(await res.json())
  }

  const loadOrders = async (date) => {
    const url = date ? `/api/orders?date=${date}` : '/api/orders'
    const res = await authFetch(supabase, url)
    if (res.ok) setOrders(await res.json())
  }

  const loadCheckoutFields = async () => {
    const res = await authFetch(supabase, '/api/checkout-fields')
    if (res.ok) setCheckoutFields(await res.json())
  }

  const loadMessages = async () => {
    const res = await authFetch(supabase, '/api/messages')
    if (res.ok) setMessages(await res.json())
  }

  const loadUserPlan = async () => {
    const res = await authFetch(supabase, '/api/user-plan')
    if (res.ok) setUserPlan(await res.json())
  }

  const loadInfoContent = async () => {
    const res = await fetch('/api/info-content')
    if (res.ok) setInfoContent(await res.json())
  }

  const loadReports = async (override) => {
    const range = override || reportDateRange
    if (override) setReportDateRange(override)
    const params = new URLSearchParams()
    if (range.start) params.set('startDate', range.start)
    if (range.end) params.set('endDate', range.end)
    const res = await authFetch(supabase, `/api/reports?${params}`)
    if (res.ok) setReports(await res.json())
  }

  // Quick date presets for profit reports (daily / monthly)
  const reportPreset = (key) => {
    const now = new Date()
    const fmt = (d) => d.toISOString().split('T')[0]
    let start, end
    if (key === 'today') { start = fmt(now); end = fmt(now) }
    else if (key === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); start = fmt(s); end = fmt(now) }
    else if (key === 'month') { start = fmt(new Date(now.getFullYear(), now.getMonth(), 1)); end = fmt(now) }
    else if (key === 'lastMonth') { start = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)); end = fmt(new Date(now.getFullYear(), now.getMonth(), 0)) }
    else { start = fmt(now); end = fmt(now) }
    loadReports({ start, end })
  }

  // Dashboard stats (visits, sales, low stock)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const res = await authFetch(supabase, '/api/dashboard-stats')
      if (res.ok) setStats(await res.json())
    } catch (e) {
      console.error('Stats error:', e)
    } finally {
      setStatsLoading(false)
    }
  }

  // Manual sale
  const [manualSale, setManualSale] = useState({ open: false, customerName: '', saleDate: today, items: [], deposit: '', discount: '', status: 'delivered' })
  const [saleLine, setSaleLine] = useState({ productId: '', quantity: 1, wholesale: false, price: '' })
  const [savingSale, setSavingSale] = useState(false)

  const getUnitPrice = (p) => (p?.promo_active && p?.promo_price ? parseFloat(p.promo_price) : parseFloat(p?.price || 0))

  const addSaleLine = () => {
    if (!saleLine.productId) { toast.error('Selecciona un producto'); return }
    const product = products.find(p => p.id === saleLine.productId)
    if (!product) return
    const qty = Math.max(1, parseInt(saleLine.quantity) || 1)
    // Wholesale: use the custom "precio nuevo" typed by the user
    const retail = getUnitPrice(product)
    const unit = (saleLine.wholesale && saleLine.price !== '' && !isNaN(parseFloat(saleLine.price)))
      ? parseFloat(saleLine.price)
      : retail
    const cost = parseFloat(product.cost_price) || 0
    const existing = manualSale.items.find(i => i.productId === product.id && i.unitPrice === unit)
    let newItems
    if (existing) {
      newItems = manualSale.items.map(i => (i.productId === product.id && i.unitPrice === unit) ? { ...i, quantity: i.quantity + qty, subtotal: (i.quantity + qty) * unit } : i)
    } else {
      newItems = [...manualSale.items, { productId: product.id, productName: product.name, quantity: qty, unitPrice: unit, originalPrice: retail, costPrice: cost, subtotal: unit * qty, wholesale: saleLine.wholesale }]
    }
    setManualSale({ ...manualSale, items: newItems })
    setSaleLine({ productId: '', quantity: 1, wholesale: false, price: '' })
  }

  // ===== Materiales (stock de insumos) =====
  const [materials, setMaterials] = useState([])
  const [materialDialog, setMaterialDialog] = useState({ open: false, data: null })
  const [movementDialog, setMovementDialog] = useState({ open: false, material: null, type: 'purchase', quantity: '', unit_cost: '', note: '' })
  const [savingMaterial, setSavingMaterial] = useState(false)

  const loadMaterials = async () => {
    try {
      const res = await authFetch(supabase, '/api/materials')
      if (res.ok) setMaterials(await res.json())
    } catch (e) { /* ignore */ }
  }

  const saveMaterial = async () => {
    const d = materialDialog.data
    if (!d?.name) { toast.error('Nombre requerido'); return }
    setSavingMaterial(true)
    try {
      const isEdit = !!d.id
      const res = await authFetch(supabase, isEdit ? `/api/materials/${d.id}` : '/api/materials', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      })
      if (res.ok) { toast.success('Material guardado'); setMaterialDialog({ open: false, data: null }); loadMaterials() }
      else { const e = await res.json(); toast.error(e.error || 'Error') }
    } catch (e) { toast.error('Error de conexión') } finally { setSavingMaterial(false) }
  }

  const deleteMaterial = async (id) => {
    if (!confirm('¿Eliminar este material?')) return
    const res = await authFetch(supabase, `/api/materials/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Eliminado'); setMaterials(prev => prev.filter(m => m.id !== id)) }
  }

  const saveMovement = async () => {
    const m = movementDialog
    const qty = parseFloat(m.quantity)
    if (!qty || qty <= 0) { toast.error('Cantidad inválida'); return }
    setSavingMaterial(true)
    try {
      const res = await authFetch(supabase, `/api/materials/${m.material.id}/movement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: m.type, quantity: qty, unit_cost: m.unit_cost, note: m.note })
      })
      if (res.ok) {
        const updated = await res.json()
        toast.success(m.type === 'purchase' ? 'Compra registrada' : m.type === 'usage' ? 'Uso descontado' : 'Ajuste guardado')
        setMaterials(prev => prev.map(x => x.id === updated.id ? updated : x))
        setMovementDialog({ open: false, material: null, type: 'purchase', quantity: '', unit_cost: '', note: '' })
      } else { const e = await res.json(); toast.error(e.error || 'Error') }
    } catch (e) { toast.error('Error de conexión') } finally { setSavingMaterial(false) }
  }

  const removeSaleLine = (productId) => {
    setManualSale({ ...manualSale, items: manualSale.items.filter(i => i.productId !== productId) })
  }

  // Load combo components when opening a combo product for editing
  useEffect(() => {
    const loadCombo = async () => {
      if (productDialog.open && productDialog.data?.id && productDialog.data?.is_combo && productDialog.data?.combo_items === undefined) {
        try {
          const res = await authFetch(supabase, `/api/products/${productDialog.data.id}/combo`)
          if (res.ok) {
            const rows = await res.json()
            setProductDialog(prev => ({ ...prev, data: { ...prev.data, combo_items: (rows || []).map(r => ({ component_product_id: r.component_product_id, quantity: r.quantity })) } }))
          }
        } catch (e) { /* ignore */ }
      }
    }
    loadCombo()
  }, [productDialog.open, productDialog.data?.id])

  const manualSaleSubtotal = manualSale.items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const manualSaleDiscount = parseFloat(manualSale.discount) || 0
  const manualSaleTotal = Math.max(0, manualSaleSubtotal - manualSaleDiscount)
  const manualSaleDeposit = parseFloat(manualSale.deposit) || 0
  const manualSaleBalance = Math.max(0, manualSaleTotal - manualSaleDeposit)

  const saveManualSale = async () => {
    if (manualSale.items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    setSavingSale(true)
    try {
      const res = await authFetch(supabase, '/api/orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: manualSale.customerName || 'Venta directa',
          description: manualSale.items.map(i => `${i.quantity}x ${i.productName}`).join(', '),
          total: manualSaleTotal,
          discount: manualSaleDiscount,
          deposit: manualSaleDeposit,
          status: manualSale.status || 'delivered',
          saleDate: manualSale.saleDate,
          deductStock: true,
          items: manualSale.items
        })
      })
      if (res.ok) {
        toast.success('Venta registrada')
        setManualSale({ open: false, customerName: '', saleDate: today, items: [], deposit: '', discount: '', status: 'delivered' })
        setSaleLine({ productId: '', quantity: 1, wholesale: false, price: '' })
        loadOrders(orderDateFilter)
        loadProducts()
        loadStats()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al registrar venta')
      }
    } catch (e) {
      toast.error('Error de conexión')
    } finally {
      setSavingSale(false)
    }
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

  // Update order (edit customer info, notes, etc.)
  const updateOrder = async (orderId, updates) => {
    try {
      const res = await authFetch(supabase, `/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (res.ok) {
        toast.success('Pedido actualizado')
        loadOrders(orderDateFilter)
        return true
      } else {
        const error = await res.json()
        toast.error(error.error || 'Error al actualizar')
        return false
      }
    } catch (error) {
      toast.error('Error de conexión')
      return false
    }
  }

  // Order dialog for editing
  const [orderDialog, setOrderDialog] = useState({ open: false, data: null, editing: false })
  const [orderEditData, setOrderEditData] = useState({})
  const [receiptOrder, setReceiptOrder] = useState(null)

  // Save settings
  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await authFetch(supabase, '/api/settings', {
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

  // Change password (Supabase auth)
  const [passwordData, setPasswordData] = useState({ new: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const changePassword = async () => {
    if (!passwordData.new || passwordData.new.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (passwordData.new !== passwordData.confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.new })
      if (error) {
        toast.error(error.message || 'Error al cambiar la contraseña')
      } else {
        toast.success('Contraseña actualizada correctamente')
        setPasswordData({ new: '', confirm: '' })
      }
    } catch (e) {
      toast.error('Error al cambiar la contraseña')
    } finally {
      setChangingPassword(false)
    }
  }

  // Category CRUD
  const saveCategory = async (data) => {
    setSaving(true)
    try {
      const isEdit = !!data.id
      const res = await authFetch(supabase, isEdit ? `/api/categories/${data.id}` : '/api/categories', {
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
        // Update local state from server response (avoid refetching full list)
        setProducts(prev => isEdit
          ? prev.map(p => p.id === result.id ? result : p)
          : [result, ...prev])
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

  const updateStock = async (product, newStock) => {
    const stockVal = newStock === '' || newStock === null ? null : Math.max(0, parseInt(newStock))
    const res = await authFetch(supabase, `/api/products/${product.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_quantity: stockVal }) // send only the changed field
    })
    if (res.ok) {
      const result = await res.json()
      toast.success('Stock actualizado')
      setProducts(prev => prev.map(p => p.id === result.id ? result : p))
    } else {
      toast.error('Error al actualizar stock')
    }
  }

  const deleteProduct = async (id) => {
    if (!confirm('¿Eliminar este elemento?')) return
    const res = await authFetch(supabase, `/api/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Eliminado')
      setProducts(prev => prev.filter(p => p.id !== id)) // remove from local state
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
    <div className="min-h-screen bg-app-gradient">
      {/* Header */}
      <header className="glass border-b border-white/40 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 gradient-brand rounded-xl flex items-center justify-center shadow-md">
              <businessConfig.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">{settings?.store_name || `${profile.first_name} ${profile.last_name}`}</h1>
              <p className="text-xs text-muted-foreground">{businessConfig.label}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Plan status badge */}
            {planStatus.status !== 'none' && (
              <Badge variant={planStatus.status === 'warning' || planStatus.status === 'expired' ? 'destructive' : 'secondary'} className="shadow-sm">
                {planStatus.message}
              </Badge>
            )}
            
            {/* Messages indicator */}
            {messages.filter(m => !m.is_read).length > 0 && (
              <Badge variant="destructive" className="animate-pulse shadow-sm">
                <Bell className="w-3 h-3 mr-1" />
                {messages.filter(m => !m.is_read).length}
              </Badge>
            )}
            
            <Button variant="ghost" size="sm" onClick={onLogout} className="hover:bg-destructive/10 hover:text-destructive">
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
          <TabsList className="mb-6 flex-wrap h-auto gap-1 bg-white/60 backdrop-blur p-1.5 shadow-sm">
            <TabsTrigger value="inicio" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Home className="w-4 h-4" /> Inicio
            </TabsTrigger>
            {hasBookings(profile.business_type) && (
              <TabsTrigger value="agenda" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
                <CalendarDays className="w-4 h-4" /> Agenda
              </TabsTrigger>
            )}
            {hasBookings(profile.business_type) && (
              <TabsTrigger value="fichas" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
                <FileText className="w-4 h-4" /> Fichas capilares
              </TabsTrigger>
            )}
            <TabsTrigger value="settings" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Settings className="w-4 h-4" /> Configuración
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Package className="w-4 h-4" /> {businessConfig.productLabel}
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Boxes className="w-4 h-4" /> Stock
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Package className="w-4 h-4" /> Materiales
            </TabsTrigger>
            <TabsTrigger value="checkout" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <CreditCard className="w-4 h-4" /> Checkout
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <ShoppingCart className="w-4 h-4" /> Pedidos
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <BarChart3 className="w-4 h-4" /> Reportes
            </TabsTrigger>
            <TabsTrigger value="website" className="gap-2 data-[state=active]:gradient-brand data-[state=active]:text-white data-[state=active]:shadow-md">
              <Globe className="w-4 h-4" /> Mi Web
            </TabsTrigger>
          </TabsList>

          {/* Inicio / Dashboard Tab */}
          {hasBookings(profile.business_type) && (
            <TabsContent value="agenda">
              <BookingManager supabase={supabase} profile={profile} />
            </TabsContent>
          )}
          {hasBookings(profile.business_type) && (
            <TabsContent value="fichas">
              <DiagnosticsManager supabase={supabase} profile={profile} userId={user.id} businessPhone={settings?.whatsapp_number} />
            </TabsContent>
          )}

          <TabsContent value="inicio">
            <div className="space-y-6">
              {/* Low stock alert */}
              {stats?.lowStock?.length > 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-amber-800">Alerta de stock bajo</p>
                        <p className="text-sm text-amber-700 mb-2">{stats.lowStock.length} producto(s) con poco inventario</p>
                        <div className="flex flex-wrap gap-2">
                          {stats.lowStock.map(p => (
                            <Badge key={p.id} className={`${p.stock_quantity <= 0 ? 'bg-red-500' : 'bg-amber-500'} text-white`}>
                              {p.name}: {p.stock_quantity <= 0 ? 'Agotado' : p.stock_quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('stock')}>Ver stock</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(() => {
                const lowMaterials = (materials || []).filter(m => Number(m.stock_quantity) <= 5)
                if (lowMaterials.length === 0) return null
                return (
                  <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-orange-800">Materiales por agotarse</p>
                          <p className="text-sm text-orange-700 mb-2">{lowMaterials.length} material(es) con poco stock</p>
                          <div className="flex flex-wrap gap-2">
                            {lowMaterials.map(m => (
                              <Badge key={m.id} className={`${Number(m.stock_quantity) <= 0 ? 'bg-red-500' : 'bg-orange-500'} text-white`}>
                                {m.name}: {Number(m.stock_quantity) <= 0 ? 'Agotado' : `${m.stock_quantity} ${m.unit || ''}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setActiveTab('materials')}>Ver materiales</Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 opacity-90 mb-1"><Eye className="w-4 h-4" /><span className="text-xs">Visitas hoy</span></div>
                    <p className="text-3xl font-extrabold">{stats?.visitsToday ?? 0}</p>
                    <p className="text-xs opacity-80 mt-1">{stats?.visitsWeek ?? 0} esta semana</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 opacity-90 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs">Ventas hoy</span></div>
                    <p className="text-2xl font-extrabold">{formatPrice(stats?.salesToday ?? 0)}</p>
                    <p className="text-xs opacity-80 mt-1">{stats?.ordersToday ?? 0} pedidos</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500 to-amber-600 text-white border-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 opacity-90 mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs">Ventas semana</span></div>
                    <p className="text-2xl font-extrabold">{formatPrice(stats?.salesWeek ?? 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-pink-500 to-rose-600 text-white border-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 opacity-90 mb-1"><Eye className="w-4 h-4" /><span className="text-xs">Visitas totales</span></div>
                    <p className="text-3xl font-extrabold">{stats?.visitsTotal ?? 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-600" /> Ventas últimos 7 días</CardTitle></CardHeader>
                  <CardContent>
                    <BarChart data={stats?.salesByDay || []} valueKey="total" color="#10b981" formatValue={formatPrice} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="w-4 h-4 text-indigo-600" /> Visitas últimos 7 días</CardTitle></CardHeader>
                  <CardContent>
                    <BarChart data={stats?.visitsByDay || []} valueKey="count" color="#6366f1" formatValue={(v) => v} />
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
                  {statsLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Actualizar
                </Button>
              </div>
            </div>
          </TabsContent>

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
                  <ImageUpload
                    label="Logo de tu tienda"
                    value={settings?.logo_url || ''}
                    onChange={(v) => setSettings({ ...settings, logo_url: v })}
                    aspect="square"
                    folder="settings/logo"
                  />
                  <ImageUpload
                    label="Imagen de Portada"
                    value={settings?.cover_image_url || ''}
                    onChange={(v) => setSettings({ ...settings, cover_image_url: v })}
                    aspect="cover"
                    maxSizeMB={0.8}
                    folder="settings/cover"
                  />
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

                  {/* Theme Presets */}
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-base font-semibold">Temas predefinidos</Label>
                    <p className="text-sm text-muted-foreground mb-3">Haz clic en un tema para aplicarlo</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { name: 'Claro', bg: '#ffffff', text: '#1a1a1a', btn: '#7c3aed' },
                        { name: 'Oscuro', bg: '#0f172a', text: '#f8fafc', btn: '#a855f7' },
                        { name: 'Crema', bg: '#fef7e0', text: '#3a2a14', btn: '#d97706' },
                        { name: 'Menta', bg: '#ecfdf5', text: '#064e3b', btn: '#10b981' },
                        { name: 'Rosa', bg: '#fdf2f8', text: '#831843', btn: '#ec4899' },
                        { name: 'Cielo', bg: '#eff6ff', text: '#1e3a8a', btn: '#3b82f6' },
                        { name: 'Lila', bg: '#f5f3ff', text: '#4c1d95', btn: '#8b5cf6' },
                        { name: 'Negro', bg: '#000000', text: '#ffffff', btn: '#f59e0b' },
                      ].map((t) => (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => setSettings({
                            ...settings,
                            theme_bg_color: t.bg,
                            theme_font_color: t.text,
                            theme_button_color: t.btn,
                          })}
                          className="group relative rounded-lg overflow-hidden border-2 hover:border-primary hover:scale-105 transition-all"
                          style={{
                            backgroundColor: t.bg,
                            borderColor: settings?.theme_bg_color === t.bg && settings?.theme_button_color === t.btn ? t.btn : '#e5e7eb',
                          }}
                        >
                          <div className="p-2.5 text-center" style={{ color: t.text }}>
                            <div className="w-full h-2 rounded-full mb-1.5" style={{ backgroundColor: t.btn }} />
                            <span className="text-xs font-medium">{t.name}</span>
                          </div>
                        </button>
                      ))}
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
                    <Label>Nombre de la tienda</Label>
                    <Input
                      placeholder="Ej: Tienda Ever López"
                      value={settings?.store_name || ''}
                      onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Este nombre se mostrará en tu tienda pública</p>
                  </div>
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
                    <ImageUpload
                      label="Imagen del QR"
                      value={settings?.payment_qr_url || ''}
                      onChange={(v) => setSettings({ ...settings, payment_qr_url: v })}
                      aspect="square"
                      maxSizeMB={0.4}
                      folder="settings/payment-qr"
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

              {/* Change Password */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Seguridad</CardTitle>
                  <CardDescription>Cambia la contraseña de tu cuenta</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nueva contraseña</Label>
                    <Input
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={passwordData.new}
                      onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Confirmar contraseña</Label>
                    <Input
                      type="password"
                      placeholder="Repite la contraseña"
                      value={passwordData.confirm}
                      onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                    />
                  </div>
                  <Button onClick={changePassword} disabled={changingPassword} variant="outline">
                    {changingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Cambiar contraseña
                  </Button>
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
                <Button onClick={() => setProductDialog({ open: true, data: { name: '', description: '', price: '', image_url: '', category_id: 'none', promo_price: '', promo_active: false, is_featured: false, is_active: true, stock_quantity: '' } })}>
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
                    {products.map(product => {
                      const mainImg = parseImages(product.image_url)[0]
                      return (
                      <Card key={product.id} className="overflow-hidden">
                        {mainImg && (
                          <div className="aspect-video bg-slate-100 relative">
                            <img src={mainImg} alt={product.name} className="w-full h-full object-cover" />
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
                          {product.stock_quantity !== null && product.stock_quantity !== undefined && (
                            <Badge variant="outline" className={`mt-2 ml-1 ${product.stock_quantity <= 0 ? 'bg-red-100 text-red-700 border-red-200' : product.stock_quantity <= 5 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                              <Boxes className="w-3 h-3 mr-1" /> {product.stock_quantity <= 0 ? 'Agotado' : `${product.stock_quantity} en stock`}
                            </Badge>
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
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Boxes className="w-5 h-5" /> Inventario / Stock</CardTitle>
                <CardDescription>Controla la cantidad disponible de cada {businessConfig.productLabel.toLowerCase()}. El stock se descuenta automáticamente con cada pedido.</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const tracked = products.filter(p => p.stock_quantity !== null && p.stock_quantity !== undefined)
                  const outOfStock = tracked.filter(p => p.stock_quantity <= 0).length
                  const lowStock = tracked.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 5).length
                  return (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="rounded-xl bg-green-50 border border-green-100 p-4 text-center">
                        <p className="text-2xl font-bold text-green-700">{tracked.length}</p>
                        <p className="text-xs text-green-600">Con control de stock</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
                        <p className="text-2xl font-bold text-amber-700">{lowStock}</p>
                        <p className="text-xs text-amber-600">Stock bajo (≤5)</p>
                      </div>
                      <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
                        <p className="text-2xl font-bold text-red-700">{outOfStock}</p>
                        <p className="text-xs text-red-600">Agotados</p>
                      </div>
                    </div>
                  )
                })()}

                {products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Boxes className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay {businessConfig.productLabel.toLowerCase()} aún</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {products.map(product => {
                      const mainImg = parseImages(product.image_url)[0]
                      const stock = product.stock_quantity
                      const hasStock = stock !== null && stock !== undefined
                      return (
                        <div key={product.id} className="flex items-center gap-3 p-3 rounded-xl border bg-white/60 hover:bg-white transition">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                            {mainImg ? (
                              <img src={mainImg} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="w-5 h-5" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {hasStock ? (
                                stock <= 0 ? <span className="text-red-600 font-semibold">Agotado</span>
                                : stock <= 5 ? <span className="text-amber-600 font-semibold">Stock bajo: {stock}</span>
                                : <span className="text-green-600 font-semibold">{stock} disponibles</span>
                              ) : <span className="text-slate-400">Stock ilimitado</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              className="w-20 h-9"
                              defaultValue={hasStock ? stock : ''}
                              placeholder="∞"
                              onKeyDown={(e) => { if (e.key === 'Enter') updateStock(product, e.target.value) }}
                              onBlur={(e) => {
                                const v = e.target.value
                                const current = hasStock ? String(stock) : ''
                                if (v !== current) updateStock(product, v)
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">Escribe la cantidad y presiona Enter (o haz clic fuera) para guardar. Deja vacío para stock ilimitado.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Materiales Tab */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Materiales / Insumos</CardTitle>
                  <CardDescription>Compra materiales para sumar stock y descuéntalos manualmente cuando los uses.</CardDescription>
                </div>
                <Button onClick={() => setMaterialDialog({ open: true, data: { name: '', unit: 'un', stock_quantity: 0, unit_cost: 0 } })}>
                  <Plus className="w-4 h-4 mr-2" /> Nuevo material
                </Button>
              </CardHeader>
              <CardContent>
                {materials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay materiales aún</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {materials.map(m => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border bg-white/60">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Stock: <span className="font-semibold">{m.stock_quantity} {m.unit}</span>
                            {m.unit_cost > 0 && <> · Costo unit.: {formatPrice(m.unit_cost)}</>}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200" onClick={() => setMovementDialog({ open: true, material: m, type: 'purchase', quantity: '', unit_cost: m.unit_cost || '', note: '' })}>
                          <Plus className="w-3 h-3 mr-1" /> Compra
                        </Button>
                        <Button size="sm" variant="outline" className="text-amber-700 border-amber-200" onClick={() => setMovementDialog({ open: true, material: m, type: 'usage', quantity: '', unit_cost: '', note: '' })}>
                          Usar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMaterialDialog({ open: true, data: m })}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMaterial(m.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle>Pedidos y Ventas</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setManualSale({ open: true, customerName: '', saleDate: today, items: [] }); setSaleLine({ productId: '', quantity: 1 }) }}>
                      <Plus className="w-4 h-4 mr-1" /> Cargar venta
                    </Button>
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
                <Tabs defaultValue="nuevos" className="w-full">
                  <TabsList className="grid grid-cols-2 mb-4">
                    <TabsTrigger value="nuevos" className="text-sm">
                      Nuevos
                      {orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length > 0 && (
                        <Badge className="ml-1 bg-yellow-500">{orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="entregados" className="text-sm">
                      Entregados
                      {orders.filter(o => o.status === 'delivered').length > 0 && (
                        <Badge className="ml-1 bg-green-500">{orders.filter(o => o.status === 'delivered').length}</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* Nuevos */}
                  <TabsContent value="nuevos">
                    {orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay pedidos nuevos</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).map(order => (
                            <OrderCard 
                              key={order.id} 
                              order={order} 
                              formatPrice={formatPrice}
                              onView={() => setOrderDialog({ open: true, data: order })}
                              onReceipt={() => setReceiptOrder(order)}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <>
                                  <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                                    <Truck className="w-4 h-4 mr-1" /> Marcar Entregado
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

                  {/* Entregados */}
                  <TabsContent value="entregados">
                    {orders.filter(o => o.status === 'delivered').length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No hay ventas entregadas</p>
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
                              onReceipt={() => setReceiptOrder(order)}
                              onDelete={() => deleteOrder(order.id)}
                              actions={
                                <>
                                  <Badge className="bg-green-100 text-green-700">✓ Entregado</Badge>
                                  <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, 'pending')}>
                                    Reabrir
                                  </Button>
                                </>
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
                  <CardTitle>Reportes de Ganancia</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
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
                    <Button onClick={() => loadReports()}>Generar</Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <Button size="sm" variant="outline" onClick={() => reportPreset('today')}>Hoy</Button>
                  <Button size="sm" variant="outline" onClick={() => reportPreset('week')}>Últimos 7 días</Button>
                  <Button size="sm" variant="outline" onClick={() => reportPreset('month')}>Este mes</Button>
                  <Button size="sm" variant="outline" onClick={() => reportPreset('lastMonth')}>Mes anterior</Button>
                </div>
              </CardHeader>
              <CardContent>
                {!reports ? (
                  <div className="text-center py-8">
                    <Button onClick={() => loadReports()} size="lg">
                      <BarChart3 className="w-5 h-5 mr-2" />
                      Cargar Reporte del Día
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      Haz clic para ver las ventas entregadas de hoy
                    </p>
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
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-muted-foreground mb-1">
                            <Tag className="w-4 h-4" />
                            <span className="text-sm">Costo</span>
                          </div>
                          <p className="text-2xl font-bold text-orange-600">{formatPrice(reports.totalCost || 0)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 opacity-90 mb-1">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-sm">Ganancia</span>
                          </div>
                          <p className="text-2xl font-extrabold">{formatPrice(reports.totalProfit || 0)}</p>
                          {reports.totalDiscount > 0 && <p className="text-xs opacity-80 mt-1">Descuentos: {formatPrice(reports.totalDiscount)}</p>}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Top Products */}
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Ganancia por producto
                      </h3>
                      {reports.topProducts?.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-right">Cant.</TableHead>
                              <TableHead className="text-right">Ingresos</TableHead>
                              <TableHead className="text-right">Ganancia</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reports.topProducts.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell>{p.name}</TableCell>
                                <TableCell className="text-right">{p.quantity}</TableCell>
                                <TableCell className="text-right">{formatPrice(p.revenue)}</TableCell>
                                <TableCell className={`text-right font-semibold ${(p.profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatPrice(p.profit || 0)}</TableCell>
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

      {/* Manual Sale Dialog */}
      <Dialog open={manualSale.open} onOpenChange={(open) => setManualSale({ ...manualSale, open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar venta del día</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-1">
            {/* Product + quantity selector */}
            <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Agregar producto</Label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <Switch checked={saleLine.wholesale} onCheckedChange={(v) => setSaleLine({ ...saleLine, wholesale: v })} />
                  Mayorista
                </label>
              </div>
              <div className="flex gap-2">
                <Select value={saleLine.productId} onValueChange={(v) => setSaleLine({ ...saleLine, productId: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && <div className="px-2 py-2 text-sm text-muted-foreground">No hay productos</div>}
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatPrice(getUnitPrice(p))}
                        {p.stock_quantity !== null && p.stock_quantity !== undefined ? ` (stock: ${p.stock_quantity})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  className="w-16"
                  value={saleLine.quantity}
                  onChange={(e) => setSaleLine({ ...saleLine, quantity: e.target.value })}
                />
                <Button type="button" onClick={addSaleLine}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {saleLine.wholesale && (
                <div>
                  <Label className="text-xs">Precio nuevo (mayorista) por unidad</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ej: 8000"
                    value={saleLine.price}
                    onChange={(e) => setSaleLine({ ...saleLine, price: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Items list */}
            {manualSale.items.length > 0 && (
              <div className="space-y-2">
                {manualSale.items.map(item => (
                  <div key={item.productId} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-white">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} x {formatPrice(item.unitPrice)}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatPrice(item.subtotal)}</span>
                    <Button size="sm" variant="ghost" className="text-red-500 h-8 w-8 p-0" onClick={() => removeSaleLine(item.productId)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-semibold">{formatPrice(manualSaleSubtotal)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente (opcional)</Label>
                <Input
                  placeholder="Venta directa"
                  value={manualSale.customerName}
                  onChange={(e) => setManualSale({ ...manualSale, customerName: e.target.value })}
                />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={manualSale.saleDate}
                  onChange={(e) => setManualSale({ ...manualSale, saleDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Descuento (Gs/$)</Label>
                <Input
                  type="number" min="0" placeholder="0"
                  value={manualSale.discount}
                  onChange={(e) => setManualSale({ ...manualSale, discount: e.target.value })}
                />
              </div>
              <div>
                <Label>Seña recibida</Label>
                <Input
                  type="number" min="0" placeholder="0"
                  value={manualSale.deposit}
                  onChange={(e) => setManualSale({ ...manualSale, deposit: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Estado de la venta</Label>
              <Select value={manualSale.status} onValueChange={(v) => setManualSale({ ...manualSale, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivered">Entregada (pago completo)</SelectItem>
                  <SelectItem value="preparing">En preparación (con seña / saldo pendiente)</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Totals summary */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex justify-between text-sm"><span>Total</span><span className="font-extrabold text-emerald-600">{formatPrice(manualSaleTotal)}</span></div>
              {manualSale.status !== 'delivered' && (
                <>
                  <div className="flex justify-between text-sm"><span>Seña</span><span>{formatPrice(manualSaleDeposit)}</span></div>
                  <div className="flex justify-between text-sm font-semibold text-amber-600"><span>Saldo pendiente</span><span>{formatPrice(manualSaleBalance)}</span></div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setManualSale({ ...manualSale, open: false })}>Cancelar</Button>
              <Button onClick={saveManualSale} disabled={savingSale || manualSale.items.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingSale && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Registrar venta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Dialog */}
      <Dialog open={materialDialog.open} onOpenChange={(open) => setMaterialDialog({ ...materialDialog, open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{materialDialog.data?.id ? 'Editar' : 'Nuevo'} material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-1">
            <div>
              <Label>Nombre *</Label>
              <Input value={materialDialog.data?.name || ''} onChange={(e) => setMaterialDialog({ ...materialDialog, data: { ...materialDialog.data, name: e.target.value } })} placeholder="Ej: Papel sublimación" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Unidad</Label>
                <Input value={materialDialog.data?.unit || ''} onChange={(e) => setMaterialDialog({ ...materialDialog, data: { ...materialDialog.data, unit: e.target.value } })} placeholder="un / m / kg" />
              </div>
              <div>
                <Label>Stock inicial</Label>
                <Input type="number" min="0" value={materialDialog.data?.stock_quantity ?? ''} onChange={(e) => setMaterialDialog({ ...materialDialog, data: { ...materialDialog.data, stock_quantity: e.target.value } })} />
              </div>
              <div>
                <Label>Costo unit.</Label>
                <Input type="number" min="0" value={materialDialog.data?.unit_cost ?? ''} onChange={(e) => setMaterialDialog({ ...materialDialog, data: { ...materialDialog.data, unit_cost: e.target.value } })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMaterialDialog({ open: false, data: null })}>Cancelar</Button>
              <Button onClick={saveMaterial} disabled={savingMaterial}>{savingMaterial && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Movement Dialog */}
      <Dialog open={movementDialog.open} onOpenChange={(open) => setMovementDialog({ ...movementDialog, open })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{movementDialog.type === 'purchase' ? 'Registrar compra' : movementDialog.type === 'usage' ? 'Descontar uso' : 'Ajustar'} · {movementDialog.material?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-1">
            <div>
              <Label>Tipo</Label>
              <Select value={movementDialog.type} onValueChange={(v) => setMovementDialog({ ...movementDialog, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Compra (suma stock)</SelectItem>
                  <SelectItem value="usage">Uso (descuenta stock)</SelectItem>
                  <SelectItem value="adjust">Ajuste (fija el stock)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cantidad</Label>
                <Input type="number" min="0" value={movementDialog.quantity} onChange={(e) => setMovementDialog({ ...movementDialog, quantity: e.target.value })} />
              </div>
              {movementDialog.type === 'purchase' && (
                <div>
                  <Label>Costo unit.</Label>
                  <Input type="number" min="0" value={movementDialog.unit_cost} onChange={(e) => setMovementDialog({ ...movementDialog, unit_cost: e.target.value })} />
                </div>
              )}
            </div>
            <div>
              <Label>Nota (opcional)</Label>
              <Input value={movementDialog.note} onChange={(e) => setMovementDialog({ ...movementDialog, note: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMovementDialog({ ...movementDialog, open: false })}>Cancelar</Button>
              <Button onClick={saveMovement} disabled={savingMaterial}>{savingMaterial && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={productDialog.open} onOpenChange={(open) => setProductDialog({ ...productDialog, open })}>        <DialogContent className="max-w-2xl">
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
                <Label className="text-base font-semibold">Imágenes del producto (hasta 3)</Label>
                <p className="text-xs text-muted-foreground mb-2">La primera será la imagen principal</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => {
                    const currentImages = parseImages(productDialog.data?.image_url || '')
                    const value = currentImages[idx] || ''
                    return (
                      <ImageUpload
                        key={idx}
                        label={idx === 0 ? 'Principal' : `Foto ${idx + 1}`}
                        value={value}
                        folder="products"
                        onChange={(v) => {
                          const imgs = parseImages(productDialog.data?.image_url || '')
                          while (imgs.length < 3) imgs.push('')
                          imgs[idx] = v
                          setProductDialog({
                            ...productDialog,
                            data: { ...productDialog.data, image_url: serializeImages(imgs) }
                          })
                        }}
                        aspect="square"
                        maxSizeMB={0.5}
                      />
                    )
                  })}
                </div>
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

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Cantidad en stock</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Deja vacío para stock ilimitado"
                    value={productDialog.data?.stock_quantity ?? ''}
                    onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, stock_quantity: e.target.value === '' ? '' : parseInt(e.target.value) } })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Se descuenta automáticamente con cada venta</p>
                </div>
                <div>
                  <Label>Costo del producto</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={productDialog.data?.cost_price ?? ''}
                    onChange={(e) => setProductDialog({ ...productDialog, data: { ...productDialog.data, cost_price: e.target.value } })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Se usa para calcular la ganancia en reportes</p>
                </div>
              </div>

              {/* Combo / Kit */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Es un Combo / Kit</Label>
                    <p className="text-xs text-muted-foreground">Al venderse, descuenta el stock de cada producto incluido</p>
                  </div>
                  <Switch
                    checked={!!productDialog.data?.is_combo}
                    onCheckedChange={(v) => setProductDialog({ ...productDialog, data: { ...productDialog.data, is_combo: v, combo_items: productDialog.data?.combo_items || [] } })}
                  />
                </div>
                {productDialog.data?.is_combo && (
                  <div className="space-y-2">
                    {(productDialog.data?.combo_items || []).map((ci, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select value={ci.component_product_id || ''} onValueChange={(v) => {
                          const arr = [...(productDialog.data.combo_items || [])]; arr[idx] = { ...arr[idx], component_product_id: v }
                          setProductDialog({ ...productDialog, data: { ...productDialog.data, combo_items: arr } })
                        }}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Producto componente" /></SelectTrigger>
                          <SelectContent>
                            {products.filter(p => p.id !== productDialog.data?.id && !p.is_combo).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min="1" className="w-20" value={ci.quantity || 1}
                          onChange={(e) => { const arr = [...(productDialog.data.combo_items || [])]; arr[idx] = { ...arr[idx], quantity: e.target.value }; setProductDialog({ ...productDialog, data: { ...productDialog.data, combo_items: arr } }) }} />
                        <Button size="sm" variant="ghost" className="text-red-500 h-9 w-9 p-0" onClick={() => { const arr = (productDialog.data.combo_items || []).filter((_, i) => i !== idx); setProductDialog({ ...productDialog, data: { ...productDialog.data, combo_items: arr } }) }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => { const arr = [...(productDialog.data?.combo_items || []), { component_product_id: '', quantity: 1 }]; setProductDialog({ ...productDialog, data: { ...productDialog.data, combo_items: arr } }) }}>
                      <Plus className="w-4 h-4 mr-1" /> Agregar componente
                    </Button>
                  </div>
                )}
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
      <Dialog open={orderDialog.open} onOpenChange={(open) => setOrderDialog({ ...orderDialog, open, editing: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{orderDialog.editing ? 'Editar Pedido' : 'Detalle del Pedido'}</span>
              {!orderDialog.editing && orderDialog.data && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOrderEditData({
                      customer_name: orderDialog.data.customer_name || '',
                      customer_phone: orderDialog.data.customer_phone || '',
                      customer_email: orderDialog.data.customer_email || '',
                      notes: orderDialog.data.notes || '',
                    })
                    setOrderDialog({ ...orderDialog, editing: true })
                  }}
                  className="gap-1 mr-6"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>{orderDialog.data?.order_number}</DialogDescription>
          </DialogHeader>
          {orderDialog.data && (
            <div className="space-y-4">
              {orderDialog.editing ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <Label>Cliente</Label>
                      <Input
                        value={orderEditData.customer_name}
                        onChange={(e) => setOrderEditData({ ...orderEditData, customer_name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Teléfono</Label>
                        <Input
                          value={orderEditData.customer_phone}
                          onChange={(e) => setOrderEditData({ ...orderEditData, customer_phone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={orderEditData.customer_email}
                          onChange={(e) => setOrderEditData({ ...orderEditData, customer_email: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Notas</Label>
                      <Textarea
                        value={orderEditData.notes}
                        onChange={(e) => setOrderEditData({ ...orderEditData, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                {orderDialog.editing ? (
                  <>
                    <Button variant="outline" onClick={() => setOrderDialog({ ...orderDialog, editing: false })}>
                      Cancelar
                    </Button>
                    <Button
                      className="btn-brand"
                      onClick={async () => {
                        const ok = await updateOrder(orderDialog.data.id, orderEditData)
                        if (ok) {
                          setOrderDialog({ open: false, data: null, editing: false })
                        }
                      }}
                    >
                      <Check className="w-4 h-4 mr-2" /> Guardar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="destructive" onClick={() => { deleteOrder(orderDialog.data.id); setOrderDialog({ open: false, data: null, editing: false }); }}>
                      <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setReceiptOrder(orderDialog.data)}
                      className="border-primary text-primary hover:bg-primary/10"
                    >
                      <FileText className="w-4 h-4 mr-2" /> Recibo
                    </Button>
                    <Button variant="outline" onClick={() => setOrderDialog({ open: false, data: null, editing: false })}>
                      Cerrar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <OrderReceipt
        order={receiptOrder}
        settings={settings}
        profile={profile}
        open={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
      />
    </div>
  )
}

// Order Card Component
function OrderCard({ order, formatPrice, onView, onDelete, onReceipt, actions }) {
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
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onView} title="Ver">
                <Eye className="w-3 h-3" />
              </Button>
              {onReceipt && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={onReceipt} title="Recibo PDF">
                  <FileText className="w-3 h-3" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete} title="Eliminar">
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

// Simple bar chart (no external dependency)
function BarChart({ data, valueKey, color, formatValue }) {
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin datos aún</p>
  }
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  return (
    <div className="flex items-end justify-between gap-2 h-40 pt-4">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const heightPct = Math.round((val / max) * 100)
        const dayLabel = dayNames[new Date(d.date + 'T00:00:00').getDay()]
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] font-semibold text-gray-600">{val > 0 ? (formatValue ? formatValue(val) : val) : ''}</span>
            <div
              className="w-full rounded-t-md transition-all min-h-[2px]"
              style={{ height: `${Math.max(heightPct, val > 0 ? 6 : 2)}%`, backgroundColor: val > 0 ? color : '#e5e7eb' }}
              title={`${dayLabel}: ${formatValue ? formatValue(val) : val}`}
            />
            <span className="text-[10px] text-gray-500">{dayLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

