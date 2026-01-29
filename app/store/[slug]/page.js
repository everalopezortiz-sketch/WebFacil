'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import {
  ShoppingCart, Plus, Minus, Trash2, X, ArrowLeft,
  Phone, MapPin, Store, User, Utensils, Loader2,
  MessageCircle, CreditCard, QrCode, Building, ExternalLink,
  Star, Tag, Truck, AlertTriangle, Banknote, Link2, Check, Search
} from 'lucide-react'

const CURRENCIES = {
  USD: { symbol: '$', name: 'USD' },
  PYG: { symbol: 'Gs', name: 'Guaraní' },
  EUR: { symbol: '€', name: 'Euro' },
  BRL: { symbol: 'R$', name: 'Real' },
  ARS: { symbol: '$', name: 'Peso AR' },
  MXN: { symbol: '$', name: 'Peso MX' }
}

const BUSINESS_CONFIG = {
  ecommerce: { icon: Store, title: 'Tienda', productLabel: 'Productos' },
  personal: { icon: User, title: 'Servicios', productLabel: 'Servicios' },
  restaurant: { icon: Utensils, title: 'Menú', productLabel: 'Menú' }
}

// Background patterns
const PATTERNS = {
  none: '',
  dots: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%239C92AC' fill-opacity='0.08'%3E%3Ccircle cx='3' cy='3' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
  lines: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%239C92AC' fill-opacity='0.08'%3E%3Cpath d='M0 40L40 0H20L0 20zM40 40V20L20 40z'/%3E%3C/g%3E%3C/svg%3E")`,
  waves: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21.184 20c.357-.13.72-.264 1.088-.402l1.768-.661C33.64 15.347 39.647 14 50 14c10.271 0 15.362 1.222 24.629 4.928.955.383 1.869.74 2.75 1.072h6.225c-2.51-.73-5.139-1.691-8.233-2.928C65.888 13.278 60.562 12 50 12c-10.626 0-16.855 1.397-26.66 5.063l-1.767.662c-2.475.923-4.66 1.674-6.724 2.275h6.335zm0-20C13.258 2.892 8.077 4 0 4V2c5.744 0 9.951-.574 14.85-2h6.334zM77.38 0C85.239 2.966 90.502 4 100 4V2c-6.842 0-11.386-.542-16.396-2h-6.225zM0 14c8.44 0 13.718-1.21 22.272-4.402l1.768-.661C33.64 5.347 39.647 4 50 4c10.271 0 15.362 1.222 24.629 4.928C84.112 12.722 89.438 14 100 14v-2c-10.271 0-15.362-1.222-24.629-4.928C65.888 3.278 60.562 2 50 2 39.374 2 33.145 3.397 23.34 7.063l-1.767.662C13.223 10.84 8.163 12 0 12v2z' fill='%239C92AC' fill-opacity='0.08' fill-rule='evenodd'/%3E%3C/svg%3E")`,
  zigzag: `url("data:image/svg+xml,%3Csvg width='40' height='12' viewBox='0 0 40 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 6.172L6.172 0h5.656L0 11.828V6.172zm40 5.656L28.172 0h5.656L40 6.172v5.656zM6.172 12l12-12h3.656l12 12h-5.656L20 3.828 11.828 12H6.172zm12 0L20 10.172 21.828 12h-3.656z' fill='%239C92AC' fill-opacity='0.08' fill-rule='evenodd'/%3E%3C/svg%3E")`,
  circuit: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 304 304' width='76' height='76'%3E%3Cpath fill='%239C92AC' fill-opacity='0.06' d='M44.1 224a5 5 0 1 1 0 2H0v-2h44.1zm160 48a5 5 0 1 1 0 2H82v-2h122.1zm57.8-46a5 5 0 1 1 0-2H304v2h-42.1zm0 16a5 5 0 1 1 0-2H304v2h-42.1zm6.2-114a5 5 0 1 1 0 2h-86.2a5 5 0 1 1 0-2h86.2zm-256-48a5 5 0 1 1 0 2H0v-2h12.1zm185.8 34a5 5 0 1 1 0-2h86.2a5 5 0 1 1 0 2h-86.2zM258 12.1a5 5 0 1 1-2 0V0h2v12.1zm-64 208a5 5 0 1 1-2 0v-54.2a5 5 0 1 1 2 0v54.2zm48-198.2V80h62v2h-64V21.9a5 5 0 1 1 2 0zm16 16V64h46v2h-48V37.9a5 5 0 1 1 2 0zm-128 96V208h16v12.1a5 5 0 1 1-2 0V210h-16v-76.1a5 5 0 1 1 2 0zm-5.9-21.9a5 5 0 1 1 0 2H114v48H85.9a5 5 0 1 1 0-2H112v-48h12.1zm-6.2 130a5 5 0 1 1 0-2H176v-74.1a5 5 0 1 1 2 0V242h-60.1zm-16-64a5 5 0 1 1 0-2H114v48h10.1a5 5 0 1 1 0 2H112v-48h-10.1zM66 284.1a5 5 0 1 1-2 0V274H50v30h-2v-32h18v12.1zM236.1 176a5 5 0 1 1 0 2H226v94h48v32h-2v-30h-48v-98h12.1zm25.8-30a5 5 0 1 1 0-2H274v44.1a5 5 0 1 1-2 0V146h-10.1zm-64 96a5 5 0 1 1 0-2H208v-80h16v-14h-42.1a5 5 0 1 1 0-2H226v18h-16v80h-12.1zm86.2-210a5 5 0 1 1 0 2H272V0h2v32h10.1zM98 101.9V146H53.9a5 5 0 1 1 0-2H96v-42.1a5 5 0 1 1 2 0zM53.9 34a5 5 0 1 1 0-2H80V0h2v34H53.9zm60.1 3.9V66H82v64H69.9a5 5 0 1 1 0-2H80V64h32V37.9a5 5 0 1 1 2 0zM101.9 82a5 5 0 1 1 0-2H128V37.9a5 5 0 1 1 2 0V82h-28.1zm16-64a5 5 0 1 1 0-2H146v44.1a5 5 0 1 1-2 0V18h-26.1zm102.2 270a5 5 0 1 1 0 2H98v14h-2v-16h124.1zM242 149.9V160h16v34h-16v62h48v48h-2v-46h-48v-66h16v-30h-16v-12.1a5 5 0 1 1 2 0zM53.9 18a5 5 0 1 1 0-2H64V2H48V0h18v18H53.9zm112 32a5 5 0 1 1 0-2H192V0h50v2h-48v48h-28.1zm-48-48a5 5 0 0 1-9.8-2h2.07a3 3 0 1 0 5.66 0H178v34h-18V21.9a5 5 0 1 1 2 0V32h14V2h-58.1zm0 96a5 5 0 1 1 0-2H137l32-32h39V21.9a5 5 0 1 1 2 0V66h-40.17l-32 32H117.9zm28.1 90.1a5 5 0 1 1-2 0v-76.51L175.59 80H224V21.9a5 5 0 1 1 2 0V82h-49.59L146 112.41v75.69zm16 32a5 5 0 1 1-2 0v-99.51L184.59 96H300.1a5 5 0 0 1 3.9-3.9v2.07a3 3 0 0 0 0 5.66v2.07a5 5 0 0 1-3.9-3.9H185.41L162 121.41v98.69zm-144-64a5 5 0 1 1-2 0v-3.51l48-48V48h32V0h2v50H66v55.41l-48 48v2.69zM50 53.9v43.51l-48 48V208h26.1a5 5 0 1 1 0 2H0v-65.41l48-48V53.9a5 5 0 1 1 2 0zm-16 16V89.41l-34 34v-2.82l32-32V69.9a5 5 0 1 1 2 0zM12.1 32a5 5 0 1 1 0 2H9.41L0 43.41V40.6L8.59 32h3.51zm265.8 18a5 5 0 1 1 0-2h18.69l7.41-7.41v2.82L googl97.41 50H googl277.9zm-16 160a5 5 0 1 1 0-2H288v-71.41l16-16v2.82l-14 14V googl210h-28.1zm-208 32a5 5 0 1 1 0-2H64v-22.59L40.59 194H21.9a5 5 0 1 1 0-2H41.41L66 216.59V googl242H googl53.9zm150.2 14a5 5 0 1 1 0 2H96v-56.6L56.6 162H37.9a5 5 0 1 1 0-2h19.5L98 200.6V googl256h106.1zm-150.2 2a5 5 0 1 1 0-2H80v-46.59L48.59 178H21.9a5 5 0 1 1 0-2H49.41L82 googl208.59V googl258H googl53.9zM34 39.8v1.61L9.41 66H0v-2h8.59L32 40.59V0h2v39.8zM2 300.1a5 5 0 0 1 3.9 3.9H3.83a3 3 0 0 0-1.83-1.83v-2.07zM34 googl336h-2v-69.41L0 234.59V232h1.41l32 32H34v72z'/%3E%3C/svg%3E")`
}

export default function StorePage() {
  const params = useParams()
  const slug = params.slug

  const [storeData, setStoreData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [checkoutData, setCheckoutData] = useState({})
  const [productDetail, setProductDetail] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')

  // Load cart from localStorage
  useEffect(() => {
    if (slug) {
      const savedCart = localStorage.getItem(`cart_${slug}`)
      if (savedCart) {
        try {
          setCart(JSON.parse(savedCart))
        } catch (e) {
          console.error('Error loading cart:', e)
        }
      }
    }
  }, [slug])

  // Save cart to localStorage
  useEffect(() => {
    if (slug && cart.length >= 0) {
      localStorage.setItem(`cart_${slug}`, JSON.stringify(cart))
    }
  }, [cart, slug])

  useEffect(() => {
    if (slug) loadStore()
  }, [slug])

  const loadStore = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/${slug}`)
      const data = await res.json()
      
      if (!res.ok) {
        if (data.maintenance) {
          setError('maintenance')
        } else {
          setError('not_found')
        }
        return
      }
      
      setStoreData(data)
      
      // Initialize checkout data with default fields
      const initialData = {}
      data.checkoutFields?.forEach(field => {
        initialData[field.field_name] = ''
      })
      setCheckoutData(initialData)

      // Set default payment method
      if (data.settings?.payment_cash_enabled) {
        setSelectedPaymentMethod('cash')
      } else if (data.settings?.payment_bank_account) {
        setSelectedPaymentMethod('bank')
      } else if (data.settings?.payment_link) {
        setSelectedPaymentMethod('link')
      } else if (data.settings?.payment_qr_url) {
        setSelectedPaymentMethod('qr')
      }
    } catch (error) {
      setError('connection')
    } finally {
      setLoading(false)
    }
  }

  const { profile, settings, categories, products, checkoutFields } = storeData || {}
  const businessConfig = BUSINESS_CONFIG[profile?.business_type] || BUSINESS_CONFIG.ecommerce
  const currency = CURRENCIES[settings?.currency] || CURRENCIES.USD

  const formatPrice = (price) => {
    return `${currency.symbol} ${parseFloat(price || 0).toLocaleString()}`
  }

  const getProductPrice = (product) => {
    if (product.promo_active && product.promo_price) {
      return parseFloat(product.promo_price)
    }
    return parseFloat(product.price)
  }

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    if (!products) return []
    let filtered = [...products]
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.categories?.name && p.categories.name.toLowerCase().includes(query))
      )
    }
    
    // Apply category filter
    if (selectedCategory === 'all') return filtered
    if (selectedCategory === 'featured') return filtered.filter(p => p.is_featured)
    if (selectedCategory === 'promo') return filtered.filter(p => p.promo_active)
    return filtered.filter(p => p.category_id === selectedCategory)
  }, [products, selectedCategory, searchQuery])

  const featuredProducts = useMemo(() => {
    return products?.filter(p => p.is_featured) || []
  }, [products])

  const promoProducts = useMemo(() => {
    return products?.filter(p => p.promo_active) || []
  }, [products])

  // Cart functions
  const addToCart = (product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [...prev, { product, quantity }]
    })
    toast.success('Agregado al carrito')
  }

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      )
    )
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + getProductPrice(item.product) * item.quantity, 0)
  }, [cart])

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }, [cart])

  // Get available payment methods
  const availablePaymentMethods = useMemo(() => {
    if (!settings) return []
    const methods = []
    if (settings.payment_cash_enabled) {
      methods.push({ id: 'cash', label: 'Efectivo', icon: Banknote })
    }
    if (settings.payment_bank_account && settings.payment_bank_enabled !== false) {
      methods.push({ id: 'bank', label: 'Transferencia Bancaria', icon: Building })
    }
    if (settings.payment_link && settings.payment_link_enabled !== false) {
      methods.push({ id: 'link', label: 'Pago en línea', icon: Link2 })
    }
    if (settings.payment_qr_url && settings.payment_qr_enabled !== false) {
      methods.push({ id: 'qr', label: 'QR de Pago', icon: QrCode })
    }
    return methods
  }, [settings])

  // Get grid classes based on settings
  const getGridClasses = () => {
    const cols = settings?.grid_columns || 4
    const colClasses = {
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
      5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
      6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
    }
    return colClasses[cols] || colClasses[4]
  }

  // Checkout
  const handleCheckout = async () => {
    // Validate required fields
    const missingFields = checkoutFields?.filter(
      field => field.is_required && !checkoutData[field.field_name]?.trim()
    )
    
    if (missingFields?.length > 0) {
      toast.error(`Por favor completa: ${missingFields.map(f => f.field_label).join(', ')}`)
      return
    }

    if (availablePaymentMethods.length > 0 && !selectedPaymentMethod) {
      toast.error('Por favor selecciona un método de pago')
      return
    }

    setCheckoutLoading(true)
    try {
      // Create order
      const orderData = {
        userId: profile.id,
        customerName: checkoutData.name || checkoutData.nombre || 'Cliente',
        customerPhone: checkoutData.phone || checkoutData.telefono || '',
        customerEmail: checkoutData.email || '',
        customerData: { ...checkoutData, paymentMethod: selectedPaymentMethod },
        items: cart.map(item => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: getProductPrice(item.product),
          subtotal: getProductPrice(item.product) * item.quantity
        })),
        total: cartTotal
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      })

      if (!res.ok) throw new Error('Error al crear pedido')

      const { orderNumber } = await res.json()

      // Build WhatsApp message
      const whatsappNumber = settings?.whatsapp_number?.replace(/\D/g, '')
      if (whatsappNumber) {
        let message = `🛒 *NUEVO PEDIDO*\n`
        message += `📋 Número: ${orderNumber}\n\n`
        message += `👤 *Cliente:*\n`
        
        checkoutFields?.forEach(field => {
          if (checkoutData[field.field_name]) {
            message += `${field.field_label}: ${checkoutData[field.field_name]}\n`
          }
        })

        const paymentLabel = availablePaymentMethods.find(m => m.id === selectedPaymentMethod)?.label
        if (paymentLabel) {
          message += `💳 Método de pago: ${paymentLabel}\n`
        }
        
        message += `\n📦 *Productos:*\n`
        cart.forEach(item => {
          message += `• ${item.quantity}x ${item.product.name} - ${formatPrice(getProductPrice(item.product) * item.quantity)}\n`
        })
        
        message += `\n💰 *TOTAL: ${formatPrice(cartTotal)}*`
        
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
        window.open(whatsappUrl, '_blank')
      }

      toast.success('¡Pedido enviado!')
      setCart([])
      localStorage.removeItem(`cart_${slug}`)
      setCheckoutOpen(false)
      setCheckoutData({})
    } catch (error) {
      toast.error('Error al procesar el pedido')
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Get pattern
  const bgPattern = PATTERNS[settings?.bg_pattern] || PATTERNS.dots

  // Custom styles from settings
  const customStyles = {
    '--store-bg': settings?.theme_bg_color || '#ffffff',
    '--store-text': settings?.theme_font_color || '#1f2937',
    '--store-button': settings?.theme_button_color || '#3b82f6'
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f8fafc' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-500">Cargando tienda...</p>
        </div>
      </div>
    )
  }

  // Error states
  if (error === 'maintenance') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
            <h1 className="text-2xl font-bold mb-2">En Mantenimiento</h1>
            <p className="text-gray-600">
              Esta tienda está temporalmente en mantenimiento. Por favor vuelve más tarde.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <Store className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h1 className="text-2xl font-bold mb-2">Tienda no encontrada</h1>
            <p className="text-gray-600">
              La tienda que buscas no existe o ha sido desactivada.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const BusinessIcon = businessConfig.icon

  return (
    <div 
      className="min-h-screen"
      style={{ 
        ...customStyles,
        backgroundColor: 'var(--store-bg)',
        color: 'var(--store-text)',
        backgroundImage: bgPattern
      }}
    >
      {/* Hero/Cover Section */}
      {settings?.cover_image_url && (
        <div className="relative h-48 md:h-64 overflow-hidden">
          <img 
            src={settings.cover_image_url} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-40 backdrop-blur-lg bg-white/90 border-b shadow-sm ${settings?.cover_image_url ? '-mt-16 mx-4 rounded-xl' : ''}`}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-12 w-auto max-w-[140px] object-contain" />
            ) : (
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: 'var(--store-button)' }}
              >
                <BusinessIcon className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-xl">{profile?.first_name} {profile?.last_name}</h1>
              <p className="text-sm text-gray-500">{businessConfig.title}</p>
            </div>
          </div>

          {/* Cart Button */}
          <Button
            onClick={() => setCartOpen(true)}
            className="relative shadow-lg"
            style={{ backgroundColor: 'var(--store-button)' }}
          >
            <ShoppingCart className="w-5 h-5 text-white" />
            <span className="text-white ml-2 hidden sm:inline">Carrito</span>
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold shadow">
                {cartItemCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Location & Contact Bar */}
      {(settings?.location_link || settings?.whatsapp_number || settings?.delivery_enabled) && (
        <div className="bg-white/80 backdrop-blur border-b">
          <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
            {settings?.business_mode === 'physical' && settings?.location_link && (
              <a 
                href={settings.location_link} 
                target="_blank" 
                rel="noopener"
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition"
              >
                <MapPin className="w-4 h-4" /> Ver ubicación
              </a>
            )}
            {settings?.whatsapp_number && (
              <a 
                href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition"
              >
                <Phone className="w-4 h-4" /> WhatsApp
              </a>
            )}
            {settings?.delivery_enabled && (
              <Badge className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                <Truck className="w-3 h-3" /> Delivery disponible
              </Badge>
            )}
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        {/* Store Description */}
        {settings?.store_description && (
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <p className="text-gray-600 leading-relaxed">{settings.store_description}</p>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 rounded-full border-2 bg-white/80 backdrop-blur focus:border-blue-400 shadow-lg"
            />
            {searchQuery && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Featured Section */}
        {featuredProducts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold">Destacados</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredProducts.slice(0, 4).map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  onAdd={addToCart}
                  onDetail={setProductDetail}
                  formatPrice={formatPrice}
                  getProductPrice={getProductPrice}
                  buttonColor="var(--store-button)"
                />
              ))}
            </div>
          </section>
        )}

        {/* Promotions Section */}
        {promoProducts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Tag className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold">Promociones</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {promoProducts.slice(0, 4).map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  onAdd={addToCart}
                  onDetail={setProductDetail}
                  formatPrice={formatPrice}
                  getProductPrice={getProductPrice}
                  buttonColor="var(--store-button)"
                />
              ))}
            </div>
          </section>
        )}

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            style={selectedCategory === 'all' ? { backgroundColor: 'var(--store-button)' } : {}}
            className="rounded-full"
          >
            Todos
          </Button>
          {categories?.map(cat => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              style={selectedCategory === cat.id ? { backgroundColor: 'var(--store-button)' } : {}}
              className="whitespace-nowrap rounded-full"
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Products Grid */}
        <section>
          <h2 className="text-2xl font-bold mb-5">{businessConfig.productLabel}</h2>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-white/50 rounded-2xl">
              <Store className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No hay productos disponibles</p>
              {searchQuery && <p className="text-sm mt-2">No se encontraron resultados para "{searchQuery}"</p>}
            </div>
          ) : (
            <div className={`grid gap-4 ${getGridClasses()}`}>
              {filteredProducts.slice(0, settings?.products_per_page || 20).map(product => (
                <ProductCard 
                  key={product.id} 
                  product={product} 
                  onAdd={addToCart}
                  onDetail={setProductDetail}
                  formatPrice={formatPrice}
                  getProductPrice={getProductPrice}
                  buttonColor="var(--store-button)"
                  cardSize={settings?.card_size || 'medium'}
                />
              ))}
            </div>
          )}
        </section>

        {/* Additional Sections for Personal Pages */}
        {profile?.business_type === 'personal' && (settings?.about_me || settings?.experience || settings?.skills) && (
          <section className="mt-12 space-y-8">
            {settings?.about_me && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" /> Sobre Mí
                </h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.about_me}</p>
              </div>
            )}
            
            {settings?.experience && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4">Experiencia</h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.experience}</p>
              </div>
            )}
            
            {settings?.skills && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4">Habilidades</h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.skills}</p>
              </div>
            )}
            
            {settings?.contact_info && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Phone className="w-5 h-5" /> Contacto
                </h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.contact_info}</p>
              </div>
            )}
          </section>
        )}

        {/* Business Hours & Shipping Info */}
        {(settings?.business_hours || settings?.shipping_info) && (
          <section className="mt-12 grid md:grid-cols-2 gap-6">
            {settings?.business_hours && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4">Horario de Atención</h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.business_hours}</p>
              </div>
            )}
            
            {settings?.shipping_info && (
              <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5" /> Información de Envío
                </h3>
                <p className="text-gray-600 whitespace-pre-line">{settings.shipping_info}</p>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>Creado con ❤️ usando WebBuilder</p>
        </div>
      </footer>

      {/* Cart Dialog */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Carrito ({cartItemCount})
            </DialogTitle>
          </DialogHeader>
          
          {cart.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Tu carrito está vacío</p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      {item.product.image_url && (
                        <img 
                          src={item.product.image_url} 
                          alt={item.product.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product.name}</p>
                        <p className="text-sm text-gray-600">{formatPrice(getProductPrice(item.product))}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="w-8 h-8 rounded-full"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="w-8 h-8 rounded-full"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="w-8 h-8 text-red-500 rounded-full"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <Separator />
              
              <div className="flex items-center justify-between font-bold text-xl py-2">
                <span>Total:</span>
                <span style={{ color: 'var(--store-button)' }}>{formatPrice(cartTotal)}</span>
              </div>
              
              <DialogFooter>
                <Button 
                  className="w-full text-white font-semibold py-6 text-lg rounded-xl shadow-lg" 
                  onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}
                  style={{ backgroundColor: 'var(--store-button)' }}
                >
                  Finalizar Pedido
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalizar Pedido</DialogTitle>
            <DialogDescription>Completa tus datos para enviar el pedido</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              {checkoutFields?.map(field => (
                <div key={field.id}>
                  <Label>
                    {field.field_label}
                    {field.is_required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {field.field_type === 'textarea' ? (
                    <Textarea
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                      required={field.is_required}
                      className="mt-1"
                    />
                  ) : field.field_type === 'checkbox' ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="checkbox"
                        checked={checkoutData[field.field_name] === 'true'}
                        onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.checked ? 'true' : 'false' })}
                        className="w-4 h-4"
                      />
                    </div>
                  ) : field.field_type === 'select' && field.options?.length > 0 ? (
                    <div className="space-y-2 mt-2">
                      {field.options.map((option, i) => (
                        <label key={i} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(checkoutData[field.field_name] || '').split(',').includes(option)}
                            onChange={(e) => {
                              const current = (checkoutData[field.field_name] || '').split(',').filter(Boolean)
                              if (e.target.checked) {
                                current.push(option)
                              } else {
                                const idx = current.indexOf(option)
                                if (idx > -1) current.splice(idx, 1)
                              }
                              setCheckoutData({ ...checkoutData, [field.field_name]: current.join(',') })
                            }}
                            className="w-4 h-4"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={field.field_type === 'phone' ? 'tel' : field.field_type}
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                      required={field.is_required}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}

              {/* Payment Method Selection */}
              {availablePaymentMethods.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Método de Pago <span className="text-red-500">*</span>
                  </h3>
                  <RadioGroup value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                    <div className="space-y-2">
                      {availablePaymentMethods.map(method => (
                        <label 
                          key={method.id}
                          className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition ${selectedPaymentMethod === method.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <RadioGroupItem value={method.id} />
                          <method.icon className="w-5 h-5" />
                          <span className="font-medium">{method.label}</span>
                          {selectedPaymentMethod === method.id && (
                            <Check className="w-4 h-4 ml-auto text-blue-500" />
                          )}
                        </label>
                      ))}
                    </div>
                  </RadioGroup>

                  {/* Show payment details based on selection */}
                  {selectedPaymentMethod === 'bank' && settings?.payment_bank_account && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm">
                      <p className="font-medium mb-1">Datos para transferencia:</p>
                      <pre className="whitespace-pre-wrap text-gray-600">{settings.payment_bank_account}</pre>
                    </div>
                  )}
                  
                  {selectedPaymentMethod === 'link' && settings?.payment_link && (
                    <a 
                      href={settings.payment_link} 
                      target="_blank" 
                      rel="noopener"
                      className="flex items-center gap-2 mt-3 p-3 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100"
                    >
                      <ExternalLink className="w-4 h-4" /> Abrir enlace de pago
                    </a>
                  )}
                  
                  {selectedPaymentMethod === 'qr' && settings?.payment_qr_url && (
                    <div className="mt-3 text-center p-3 bg-gray-50 rounded-xl">
                      <img src={settings.payment_qr_url} alt="QR de pago" className="max-w-[200px] mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* Order Summary */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Resumen del Pedido</h3>
                <div className="bg-gray-50 rounded-xl p-3">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex justify-between text-sm py-1">
                      <span>{item.quantity}x {item.product.name}</span>
                      <span>{formatPrice(getProductPrice(item.product) * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2 mt-2 text-lg">
                    <span>Total</span>
                    <span style={{ color: 'var(--store-button)' }}>{formatPrice(cartTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleCheckout} 
              disabled={checkoutLoading}
              className="text-white font-semibold"
              style={{ backgroundColor: 'var(--store-button)' }}
            >
              {checkoutLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <MessageCircle className="w-4 h-4 mr-2" />
              Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog */}
      <Dialog open={!!productDetail} onOpenChange={() => setProductDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {productDetail && (
            <>
              {productDetail.image_url && (
                <div className="aspect-video -mx-6 -mt-6 mb-4 rounded-t-lg overflow-hidden">
                  <img 
                    src={productDetail.image_url} 
                    alt={productDetail.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <DialogHeader>
                <DialogTitle className="text-xl">{productDetail.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {productDetail.description && (
                  <p className="text-gray-600">{productDetail.description}</p>
                )}
                <div className="flex items-center gap-2">
                  {productDetail.promo_active && productDetail.promo_price ? (
                    <>
                      <span className="text-3xl font-bold text-red-600">
                        {formatPrice(productDetail.promo_price)}
                      </span>
                      <span className="text-xl text-gray-400 line-through">
                        {formatPrice(productDetail.price)}
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold">{formatPrice(productDetail.price)}</span>
                  )}
                </div>
                {productDetail.categories?.name && (
                  <Badge variant="outline" className="text-sm">{productDetail.categories.name}</Badge>
                )}
              </div>
              <DialogFooter>
                <Button 
                  className="w-full text-white font-semibold py-6 text-lg rounded-xl"
                  onClick={() => { addToCart(productDetail); setProductDetail(null) }}
                  style={{ backgroundColor: 'var(--store-button)' }}
                >
                  <Plus className="w-5 h-5 mr-2" /> Agregar al Carrito
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Product Card Component
function ProductCard({ product, onAdd, onDetail, formatPrice, getProductPrice, buttonColor, cardSize = 'medium' }) {
  // Size classes based on cardSize setting
  const sizeClasses = {
    small: {
      image: 'aspect-square',
      padding: 'p-3',
      title: 'text-sm',
      price: 'text-base',
      button: 'text-xs py-1'
    },
    medium: {
      image: 'aspect-square',
      padding: 'p-4',
      title: 'text-base',
      price: 'text-lg',
      button: 'text-sm py-2'
    },
    large: {
      image: 'aspect-[4/3]',
      padding: 'p-5',
      title: 'text-lg',
      price: 'text-xl',
      button: 'text-base py-3'
    }
  }
  
  const sizes = sizeClasses[cardSize] || sizeClasses.medium

  return (
    <Card 
      className="overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-white"
      onClick={() => onDetail(product)}
    >
      {product.image_url ? (
        <div className={`${sizes.image} bg-gray-100 relative overflow-hidden`}>
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
          {product.promo_active && (
            <Badge className="absolute top-2 right-2 bg-red-500 shadow-lg">Oferta</Badge>
          )}
          {product.is_featured && !product.promo_active && (
            <Badge className="absolute top-2 right-2 bg-amber-500 shadow-lg">
              <Star className="w-3 h-3" />
            </Badge>
          )}
        </div>
      ) : (
        <div className={`${sizes.image} bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center`}>
          <Store className="w-12 h-12 text-gray-300" />
        </div>
      )}
      <CardContent className={sizes.padding}>
        <h3 className={`font-semibold truncate ${sizes.title}`}>{product.name}</h3>
        {product.description && (
          <p className="text-sm text-gray-500 truncate mt-1">{product.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {product.promo_active && product.promo_price ? (
            <>
              <span className={`font-bold text-red-600 ${sizes.price}`}>{formatPrice(product.promo_price)}</span>
              <span className="text-sm text-gray-400 line-through">{formatPrice(product.price)}</span>
            </>
          ) : (
            <span className={`font-bold ${sizes.price}`}>{formatPrice(product.price)}</span>
          )}
        </div>
      </CardContent>
      <CardFooter className={`${sizes.padding} pt-0`}>
        <Button 
          size="sm" 
          className={`w-full rounded-xl text-white font-medium shadow-md hover:shadow-lg transition-shadow ${sizes.button}`}
          onClick={(e) => { e.stopPropagation(); onAdd(product) }}
          style={{ backgroundColor: buttonColor }}
        >
          <Plus className="w-4 h-4 mr-1" /> Agregar
        </Button>
      </CardFooter>
    </Card>
  )
}
