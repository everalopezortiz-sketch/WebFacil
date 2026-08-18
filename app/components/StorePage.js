'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  ShoppingCart, Plus, Minus, Trash2, X,
  Phone, Store, User, Utensils, Loader2,
  MessageCircle, QrCode, Building,
  Star, Tag, Truck, Banknote, Link2, Search, Clock,
  ChevronLeft, ChevronRight, ZoomIn,
  Heart, ShieldCheck, BadgeCheck, Home, LayoutGrid, Award, Zap, Flame, CalendarDays
} from 'lucide-react'
import { normalizeImageSrc, parseImages } from '@/lib/imageUtils'
import StoreBooking from '@/app/components/booking/StoreBooking'

const CURRENCIES = {
  USD: { symbol: '$', name: 'USD' },
  PYG: { symbol: 'Gs.', name: 'Guaraní' },
  EUR: { symbol: '€', name: 'Euro' },
  BRL: { symbol: 'R$', name: 'Real' },
  ARS: { symbol: '$', name: 'Peso AR' },
  MXN: { symbol: '$', name: 'Peso MX' }
}

const BUSINESS_CONFIG = {
  ecommerce: { icon: Store, title: 'Tienda', productLabel: 'Productos' },
  booking: { icon: CalendarDays, title: 'Tienda', productLabel: 'Productos' },
  personal: { icon: User, title: 'Servicios', productLabel: 'Servicios' },
  restaurant: { icon: Utensils, title: 'Menú', productLabel: 'Menú' }
}

// Image component with fallback
function SafeImage({ src, alt, className, fallback }) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  if (!src || error) {
    return fallback || null
  }
  
  return (
    <>
      {!loaded && <div className={`${className} bg-gray-200 animate-pulse`} />}
      <img 
        src={src}
        alt={alt || ''}
        className={`${className} ${loaded ? '' : 'hidden'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    </>
  )
}

export default function StorePage({ autoBooking = false, slug: slugProp }) {
  const params = useParams()
  const slug = slugProp || params?.slug
  
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [checkoutFields, setCheckoutFields] = useState([])
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [checkoutData, setCheckoutData] = useState({})
  const [productDetail, setProductDetail] = useState(null)
  const [productImageIndex, setProductImageIndex] = useState(0)
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0 })
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const [globalSettings, setGlobalSettings] = useState({ name: 'webFácil', whatsapp: '' })

  // Load cart from localStorage
  useEffect(() => {
    if (slug) {
      const savedCart = localStorage.getItem(`cart_${slug}`)
      if (savedCart) {
        try { setCart(JSON.parse(savedCart)) } catch (e) {}
      }
    }
  }, [slug])

  // Save cart
  useEffect(() => {
    if (slug && cart.length > 0) {
      localStorage.setItem(`cart_${slug}`, JSON.stringify(cart))
    } else if (slug) {
      localStorage.removeItem(`cart_${slug}`)
    }
  }, [cart, slug])

  // Load store data
  useEffect(() => {
    const loadStore = async () => {
      try {
        const [storeRes, globalRes] = await Promise.all([
          fetch(`/api/store/${slug}`),
          fetch('/api/global-settings')
        ])
        
        if (storeRes.ok) {
          const data = await storeRes.json()
          setProfile(data.profile)
          setSettings(data.settings)
          setProducts(data.products || [])
          setCategories(data.categories || [])
          setCheckoutFields(data.checkoutFields || [])
        }
        
        if (globalRes.ok) {
          const global = await globalRes.json()
          setGlobalSettings({
            name: global.name || 'WebBuilder',
            whatsapp: global.whatsapp_number || global.developer_whatsapp || ''
          })
        }
      } catch (error) {
        console.error('Error loading store:', error)
      } finally {
        setLoading(false)
      }
    }
    if (slug) loadStore()
  }, [slug])

  const businessConfig = BUSINESS_CONFIG[profile?.business_type] || BUSINESS_CONFIG.ecommerce
  const currency = CURRENCIES[settings?.currency] || CURRENCIES.USD

  const formatPrice = (price) => {
    if (!price) return `${currency.symbol} 0`
    const num = parseFloat(price)
    if (currency.symbol === 'Gs.') {
      return `${currency.symbol} ${num.toLocaleString('es-PY')}`
    }
    return `${currency.symbol} ${num.toFixed(2)}`
  }

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!products) return []
    let filtered = [...products]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
      )
    }
    
    if (selectedCategory === 'all') return filtered
    if (selectedCategory === 'promo') return filtered.filter(p => p.promo_active)
    if (selectedCategory === 'featured') return filtered.filter(p => p.is_featured)
    return filtered.filter(p => p.category_id === selectedCategory)
  }, [products, selectedCategory, searchQuery])

  // Payment methods
  const availablePaymentMethods = useMemo(() => {
    if (!settings) return []
    const methods = []
    if (settings.payment_cash_enabled) methods.push({ id: 'cash', label: 'Efectivo', icon: Banknote })
    if (settings.payment_bank_account) methods.push({ id: 'bank', label: 'Transferencia', icon: Building })
    if (settings.payment_link) methods.push({ id: 'link', label: 'Pago Online', icon: Link2 })
    if (settings.payment_qr_url) methods.push({ id: 'qr', label: 'QR de Pago', icon: QrCode })
    return methods
  }, [settings])

  // Cart functions
  const addToCart = (product) => {
    const stock = product.stock_quantity
    const tracked = stock !== null && stock !== undefined
    if (tracked && stock <= 0) {
      toast.error('Producto agotado')
      return
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        if (tracked && existing.quantity >= stock) {
          toast.error(`Solo quedan ${stock} unidades`)
          return prev
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, { ...product, quantity: 1 }]
    })
    toast.success('Agregado al carrito')
  }

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta
        const stock = item.stock_quantity
        if (delta > 0 && stock !== null && stock !== undefined && newQty > stock) {
          toast.error(`Solo quedan ${stock} unidades`)
          return item
        }
        return newQty > 0 ? { ...item, quantity: newQty } : item
      }
      return item
    }).filter(item => item.quantity > 0))
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId))
  }

  const getProductPrice = (product) => {
    return product.promo_active && product.promo_price ? product.promo_price : product.price
  }

  const cartTotal = cart.reduce((sum, item) => sum + (getProductPrice(item) * item.quantity), 0)
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  // WhatsApp checkout - Now saves order to database AND sends WhatsApp
  const handleWhatsAppCheckout = async () => {
    if (!settings?.whatsapp_number) {
      toast.error('WhatsApp no configurado')
      return
    }

    try {
      // First, save order to database
      const orderData = {
        userId: profile.id,
        customerName: checkoutData.name || checkoutData.nombre || '',
        customerPhone: checkoutData.phone || checkoutData.telefono || '',
        customerEmail: checkoutData.email || '',
        customerData: checkoutData,
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: getProductPrice(item),
          subtotal: getProductPrice(item) * item.quantity
        })),
        total: cartTotal,
        notes: `Método de pago: ${availablePaymentMethods.find(m => m.id === selectedPaymentMethod)?.label || 'No seleccionado'}`
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      })

      if (!res.ok) {
        const error = await res.json()
        console.error('Order save error:', error)
      }

      // Build WhatsApp message including ALL checkout fields
      let message = `🛒 *Nuevo Pedido*\n\n`
      cart.forEach(item => {
        const price = getProductPrice(item)
        message += `• ${item.name} x${item.quantity} - ${formatPrice(price * item.quantity)}\n`
      })
      message += `\n*Total: ${formatPrice(cartTotal)}*\n\n`
      message += `*Método de pago:* ${availablePaymentMethods.find(m => m.id === selectedPaymentMethod)?.label || 'No seleccionado'}\n\n`
      message += `*Datos del cliente:*\n`
      
      // Include ALL checkout fields (including custom ones like delivery/pickup)
      checkoutFields.forEach(field => {
        const value = checkoutData[field.field_name]
        if (value) {
          message += `${field.field_label}: ${value}\n`
        }
      })

      const phone = settings.whatsapp_number.replace(/\D/g, '')
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      
      // Clear cart and close dialogs first
      setCart([])
      setCheckoutOpen(false)
      setCartOpen(false)
      toast.success('¡Pedido enviado!')
      
      // Use location.href for better mobile compatibility
      window.location.href = whatsappUrl
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Error al procesar pedido')
    }
  }

  // Theme
  const bgColor = settings?.theme_bg_color || '#f8f9fa'
  const textColor = settings?.theme_font_color || '#1a1a1a'
  const buttonColor = settings?.theme_button_color || '#f59e0b'
  const gridColumns = settings?.grid_columns || 4
  const cardSize = settings?.card_size || 'medium'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: buttonColor }} />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Store className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h1 className="text-xl font-bold text-gray-600">Tienda no encontrada</h1>
        </div>
      </div>
    )
  }

  const BusinessIcon = businessConfig.icon

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: bgColor, color: textColor }}>
      {/* Hero Banner */}
      <header className="relative">
        <div className="relative h-52 md:h-64 overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-indigo-700 via-purple-700 to-fuchsia-700">
          {settings?.cover_image_url && (
            <img 
              src={normalizeImageSrc(settings.cover_image_url)}
              alt="Portada"
              className="w-full h-full object-cover"
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          {/* Floating actions */}
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <button 
              onClick={() => setSearchOpen((v) => !v)}
              className="w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center text-indigo-700 active:scale-95 transition"
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setCartOpen(true)}
              className="relative w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center text-indigo-700 active:scale-95 transition"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center border-2 border-white">{cartCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <div className="container mx-auto px-4">
          <div className="bg-white rounded-3xl shadow-xl -mt-6 relative z-10 p-5">
            <div className="flex items-center gap-4">
              <div className="p-[3px] rounded-full bg-gradient-to-tr from-fuchsia-500 via-purple-500 to-indigo-500 flex-shrink-0">
                <div className="w-20 h-20 rounded-full bg-white overflow-hidden flex items-center justify-center">
                  {settings?.logo_url ? (
                    <img 
                      src={normalizeImageSrc(settings.logo_url)}
                      alt="Logo"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex') }}
                    />
                  ) : null}
                  <div className={`w-full h-full items-center justify-center ${settings?.logo_url ? 'hidden' : 'flex'}`}>
                    <BusinessIcon className="w-9 h-9 text-indigo-600" />
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-extrabold text-gray-900 truncate">{settings?.store_name || `${profile.first_name} ${profile.last_name}`}</h1>
                {settings?.store_description && (
                  <p className="text-sm font-semibold text-indigo-600 line-clamp-2">{settings.store_description}</p>
                )}
              </div>
            </div>

            {/* Delivery info (only if enabled) */}
            {settings?.delivery_enabled && (
              <div className="mt-4 flex items-center gap-3 bg-indigo-50 rounded-2xl p-4">
                <Truck className="w-7 h-7 text-indigo-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">Delivery disponible</p>
                  <p className="text-xs text-gray-500 whitespace-pre-line">{settings?.shipping_info || 'Realizamos entregas a domicilio'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search (toggled) + Categories */}
      <div className="container mx-auto px-4 mt-5">
        {/* Search pill - only when opened via icon */}
        {searchOpen && (
          <div className="relative mb-5">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <Input
              id="store-search"
              autoFocus
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-14 pr-16 h-14 rounded-full border-0 bg-gray-100 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-400"
            />
            <button onClick={() => { setSearchQuery(''); setSearchOpen(false) }} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Category icons */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          <CatPill active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')} icon={LayoutGrid} label="Todos" />
          {products.some(p => p.promo_active) && (
            <CatPill active={selectedCategory === 'promo'} onClick={() => setSelectedCategory('promo')} icon={Tag} label="Ofertas" color="#f97316" />
          )}
          {products.some(p => p.is_featured) && (
            <CatPill active={selectedCategory === 'featured'} onClick={() => setSelectedCategory('featured')} icon={Star} label="Destacados" color="#f59e0b" />
          )}
          {categories.map(cat => (
            <CatPill key={cat.id} active={selectedCategory === cat.id} onClick={() => setSelectedCategory(cat.id)} icon={Tag} label={cat.name} />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 pb-24 flex-1">
        {profile?.business_type === 'booking' && (
          <StoreBooking slug={slug} brandColor={buttonColor} formatPrice={formatPrice} businessPhone={settings?.whatsapp_number} autoOpen={autoBooking} />
        )}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg opacity-60">No hay {businessConfig.productLabel.toLowerCase()} disponibles</p>
            {searchQuery && <p className="text-sm opacity-40 mt-2">No se encontraron resultados para "{searchQuery}"</p>}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Show by category when "all" is selected and no search */}
            {selectedCategory === 'all' && !searchQuery.trim() ? (
              <>
                {/* Ofertas imperdibles */}
                {filteredProducts.some(p => p.promo_active) && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-extrabold flex items-center gap-2 text-gray-900">
                        <Flame className="w-5 h-5 text-orange-500" /> Ofertas imperdibles
                      </h2>
                      <button onClick={() => setSelectedCategory('promo')} className="text-sm font-bold text-indigo-600 flex items-center gap-0.5">
                        Ver todas <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide">
                      {filteredProducts.filter(p => p.promo_active).slice(0, 10).map((product, i) => (
                        <OfferCard key={product.id} product={product} index={i} {...{ addToCart, setProductDetail, formatPrice }} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Default view shows only offers. Categories shown on demand. */}
                {!filteredProducts.some(p => p.promo_active) && (
                  <div className="text-center py-12">
                    <Tag className="w-14 h-14 mx-auto mb-3 text-indigo-200" />
                    <p className="text-lg font-semibold text-gray-700">Explora nuestros productos</p>
                    <p className="text-sm text-gray-400">Selecciona una categoría arriba para ver los productos</p>
                  </div>
                )}
              </>
            ) : (
              <section>
                <h2 className="text-lg font-extrabold text-gray-900 mb-4">
                  {searchQuery.trim() ? `Resultados para "${searchQuery}"` :
                   selectedCategory === 'promo' ? 'Ofertas' : 
                   selectedCategory === 'featured' ? 'Destacados' :
                   categories.find(c => c.id === selectedCategory)?.name || 'Productos'}
                </h2>
                <ProductGrid 
                  products={filteredProducts} 
                  {...{ addToCart, setProductDetail, formatPrice, getProductPrice, buttonColor, cardSize, gridColumns }}
                />
              </section>
            )}
          </div>
        )}

        {/* Additional Info */}
        {settings?.business_hours && (
          <div className="mt-10">
            <Card className="bg-white/80 border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5" style={{ color: buttonColor }} />
                  <h3 className="font-semibold">Horario de Atención</h3>
                </div>
                <p className="text-sm opacity-70 whitespace-pre-line">{settings.business_hours}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #831843 100%)' }}>
        <div className="absolute inset-0 opacity-20 pattern-dots" />
        <div className="container mx-auto px-4 py-10 relative z-10">
          <div className="flex flex-col items-center text-center gap-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xs uppercase tracking-wider text-white/60">Powered by</p>
                <p className="text-xl font-bold text-white">{globalSettings.name || 'webFácil'}</p>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40">
          <Button
            className="w-full py-6 rounded-2xl shadow-2xl text-white font-semibold text-lg bg-indigo-600 hover:bg-indigo-700"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            Ver Carrito ({cartCount}) - {formatPrice(cartTotal)}
          </Button>
        </div>
      )}

      {/* Product Detail Dialog */}
      <Dialog open={!!productDetail} onOpenChange={(open) => { if (!open) { setProductDetail(null); setProductImageIndex(0) } }}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {productDetail && (() => {
            const detailImages = parseImages(productDetail.image_url)
            const hasImages = detailImages.length > 0
            const currentIdx = Math.min(productImageIndex, detailImages.length - 1)
            const goNext = () => setProductImageIndex((currentIdx + 1) % detailImages.length)
            const goPrev = () => setProductImageIndex((currentIdx - 1 + detailImages.length) % detailImages.length)
            return (
            <>
              {hasImages && (
                <div className="aspect-square bg-gray-100 relative group">
                  <img 
                    src={detailImages[currentIdx]}
                    alt={productDetail.name}
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setLightbox({ open: true, images: detailImages, index: currentIdx })}
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setLightbox({ open: true, images: detailImages, index: currentIdx })}
                    className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full w-9 h-9 flex items-center justify-center transition"
                    aria-label="Ver en pantalla completa"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  {detailImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow-md transition"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow-md transition"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {detailImages.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setProductImageIndex(i)}
                            className={`h-2 rounded-full transition-all ${i === currentIdx ? 'bg-white w-6' : 'bg-white/60 w-2'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {detailImages.length > 1 && (
                <div className="px-4 pt-3 flex gap-2">
                  {detailImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setProductImageIndex(i)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition ${i === currentIdx ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    >
                      <img src={img} alt={`${productDetail.name} ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="p-6">
                <DialogTitle className="text-xl mb-2">{productDetail.name}</DialogTitle>
                {productDetail.description && (
                  <p className="text-sm text-gray-600 mb-4">{productDetail.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    {productDetail.promo_active && productDetail.promo_price ? (
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-red-600">{formatPrice(productDetail.promo_price)}</span>
                        <span className="text-sm text-gray-400 line-through">{formatPrice(productDetail.price)}</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold">{formatPrice(productDetail.price)}</span>
                    )}
                  </div>
                  {(() => {
                    const out = productDetail.stock_quantity !== null && productDetail.stock_quantity !== undefined && productDetail.stock_quantity <= 0
                    const low = productDetail.stock_quantity !== null && productDetail.stock_quantity !== undefined && productDetail.stock_quantity > 0
                    return (
                      <div className="flex flex-col items-end gap-1">
                        {low && <span className="text-xs text-gray-500">{productDetail.stock_quantity} disponibles</span>}
                        <Button disabled={out} style={{ backgroundColor: buttonColor }} className="text-white disabled:opacity-40" onClick={() => { addToCart(productDetail); setProductDetail(null); setProductImageIndex(0) }}>
                          <Plus className="w-4 h-4 mr-1" /> {out ? 'Agotado' : 'Agregar'}
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Lightbox */}
      <Dialog open={lightbox.open} onOpenChange={(open) => setLightbox({ ...lightbox, open })}>
        <DialogContent className="max-w-[100vw] w-screen h-screen p-0 bg-black/95 border-0 rounded-none">
          <DialogTitle className="sr-only">Vista de imagen</DialogTitle>
          {lightbox.images.length > 0 && (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={lightbox.images[lightbox.index]}
                alt="Vista ampliada"
                className="max-w-full max-h-full object-contain"
              />
              <button
                type="button"
                onClick={() => setLightbox({ open: false, images: [], index: 0 })}
                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full w-11 h-11 flex items-center justify-center transition z-10"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" />
              </button>
              {lightbox.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.images.length) % lightbox.images.length })}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12 flex items-center justify-center transition"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-7 h-7" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.images.length })}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full w-12 h-12 flex items-center justify-center transition"
                    aria-label="Siguiente"
                  >
                    <ChevronRight className="w-7 h-7" />
                  </button>
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {lightbox.images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightbox({ ...lightbox, index: i })}
                        className={`h-2.5 rounded-full transition-all ${i === lightbox.index ? 'bg-white w-8' : 'bg-white/40 w-2.5'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cart Dialog */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md max-h-[90vh] p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Tu Carrito
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="p-4 space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  {parseImages(item.image_url)[0] && (
                    <img src={parseImages(item.image_url)[0]} alt={item.name} className="w-16 h-16 rounded-lg object-cover" onError={(e) => e.target.style.display = 'none'} />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{item.name}</h4>
                    <p className="text-sm font-bold" style={{ color: buttonColor }}>{formatPrice(getProductPrice(item))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.id, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center font-medium">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.id, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-4 border-t space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-2xl font-bold" style={{ color: buttonColor }}>{formatPrice(cartTotal)}</span>
            </div>
            <Button className="w-full py-6 text-white rounded-xl" style={{ backgroundColor: buttonColor }} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>
              Continuar al Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] p-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Finalizar Pedido</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="p-4 space-y-4">
              {availablePaymentMethods.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Método de Pago</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {availablePaymentMethods.map(method => {
                      const Icon = method.icon
                      return (
                        <Button
                          key={method.id}
                          variant={selectedPaymentMethod === method.id ? 'default' : 'outline'}
                          className="flex flex-col h-auto py-3 gap-1"
                          style={selectedPaymentMethod === method.id ? { backgroundColor: buttonColor } : {}}
                          onClick={() => setSelectedPaymentMethod(method.id)}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs">{method.label}</span>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
              {checkoutFields.map(field => (
                <div key={field.id}>
                  <Label className="text-sm">
                    {field.field_label}
                    {field.is_required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {field.field_type === 'textarea' ? (
                    <Textarea
                      placeholder={field.placeholder || ''}
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                      className="mt-1"
                    />
                  ) : field.field_type === 'select' ? (
                    <select
                      className="w-full mt-1 p-2 border rounded-md"
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                    >
                      <option value="">Seleccionar...</option>
                      {(field.options || []).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <Input
                      type={field.field_type || 'text'}
                      placeholder={field.placeholder || ''}
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-4 border-t">
            <div className="flex justify-between items-center mb-4">
              <span className="font-semibold">Total a Pagar</span>
              <span className="text-xl font-bold" style={{ color: buttonColor }}>{formatPrice(cartTotal)}</span>
            </div>
            <Button className="w-full py-6 text-white rounded-xl gap-2" style={{ backgroundColor: '#25D366' }} onClick={handleWhatsAppCheckout}>
              <MessageCircle className="w-5 h-5" /> Enviar Pedido por WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Product Grid Component
function ProductGrid({ products, addToCart, setProductDetail, formatPrice, getProductPrice, buttonColor, cardSize, gridColumns }) {
  const imageHeight = cardSize === 'small' ? 'h-28' : cardSize === 'large' ? 'h-48' : 'h-36'
  const gridClass = gridColumns === 2 ? 'grid-cols-2' :
                    gridColumns === 3 ? 'grid-cols-2 md:grid-cols-3' :
                    gridColumns === 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
                    'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {products.map(product => {
        const imgs = parseImages(product.image_url)
        const mainImg = imgs[0]
        const isOutOfStock = product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity <= 0
        return (
        <div 
          key={product.id}
          className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all border border-gray-100"
          onClick={() => setProductDetail(product)}
        >
          <div className={`${imageHeight} bg-gray-100 relative`}>
            {mainImg ? (
              <img 
                src={mainImg}
                alt={product.name}
                className={`w-full h-full object-cover ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
                loading="lazy"
                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <Store className="w-10 h-10 text-gray-300" />
              </div>
            )}
            {isOutOfStock && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Badge className="bg-gray-900/80 text-white text-xs px-3 py-1">Agotado</Badge>
              </div>
            )}
            {imgs.length > 1 && (
              <Badge className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 backdrop-blur">
                +{imgs.length - 1} fotos
              </Badge>
            )}
            {product.promo_active && (
              <Badge className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2">Oferta</Badge>
            )}
            {product.is_featured && !product.promo_active && (
              <Badge className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-1.5">
                <Star className="w-3 h-3" />
              </Badge>
            )}
          </div>
          <div className="p-3">
            <h3 className="font-semibold text-sm truncate mb-1">{product.name}</h3>
            {product.description && <p className="text-xs text-gray-500 truncate mb-2">{product.description}</p>}
            <div className="flex items-center justify-between">
              <div>
                {product.promo_active && product.promo_price ? (
                  <div className="flex flex-col">
                    <span className="font-bold text-red-600 text-sm">{formatPrice(product.promo_price)}</span>
                    <span className="text-xs text-gray-400 line-through">{formatPrice(product.price)}</span>
                  </div>
                ) : (
                  <span className="font-bold text-sm" style={{ color: buttonColor }}>{formatPrice(product.price)}</span>
                )}
              </div>
              <Button
                size="sm"
                disabled={isOutOfStock}
                className="h-8 w-8 rounded-full p-0 text-white disabled:opacity-40"
                style={{ backgroundColor: buttonColor }}
                onClick={(e) => { e.stopPropagation(); addToCart(product) }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        )
      })}
    </div>
  )
}


// Category pill with icon
function CatPill({ active, onClick, icon: Icon, label, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-24 rounded-2xl border p-3 flex flex-col items-center gap-2 transition ${active ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-indigo-100' : 'bg-gray-50'}`}>
        <Icon className="w-5 h-5" style={{ color: active ? '#4f46e5' : (color || '#6b7280') }} />
      </div>
      <span className={`text-xs font-semibold truncate max-w-full ${active ? 'text-indigo-700' : 'text-gray-600'}`}>{label}</span>
    </button>
  )
}

// Bottom navigation item
function BottomNavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 transition active:scale-95">
      <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-gray-400'}`} fill={active && (label === 'Favoritos') ? '#4f46e5' : 'none'} />
      <span className={`text-[11px] font-semibold ${active ? 'text-indigo-600' : 'text-gray-400'}`}>{label}</span>
    </button>
  )
}

// Horizontal gradient offer card
const OFFER_GRADIENTS = [
  'from-purple-600 to-indigo-600',
  'from-orange-500 to-amber-500',
  'from-fuchsia-600 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-rose-500 to-red-600',
  'from-emerald-500 to-teal-600',
]
function OfferCard({ product, index, addToCart, setProductDetail, formatPrice }) {
  const imgs = parseImages(product.image_url)
  const mainImg = imgs[0]
  const gradient = OFFER_GRADIENTS[index % OFFER_GRADIENTS.length]
  const discount = (product.promo_price && product.price)
    ? Math.round((1 - parseFloat(product.promo_price) / parseFloat(product.price)) * 100)
    : 0
  const isOut = product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity <= 0
  return (
    <div
      onClick={() => setProductDetail(product)}
      className={`flex-shrink-0 w-56 rounded-3xl overflow-hidden cursor-pointer shadow-lg bg-gradient-to-br ${gradient} text-white active:scale-[0.98] transition`}
    >
      <div className="relative p-3 h-40 flex items-center justify-center">
        {discount > 0 && (
          <span className="absolute top-3 left-3 bg-amber-300 text-amber-900 text-xs font-extrabold px-2.5 py-1 rounded-lg">-{discount}%</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); if (!isOut) addToCart(product) }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/25 backdrop-blur flex items-center justify-center hover:bg-white/40"
        >
          <Heart className="w-4 h-4 text-white" />
        </button>
        {mainImg ? (
          <img src={mainImg} alt={product.name} className={`max-h-32 object-contain drop-shadow-xl ${isOut ? 'opacity-50 grayscale' : ''}`} loading="lazy" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Store className="w-16 h-16 text-white/50" />
        )}
        {isOut && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">Agotado</span>}
      </div>
      <div className="px-4 pb-4">
        <h3 className="font-bold text-base truncate">{product.name}</h3>
        <p className="text-xl font-extrabold text-amber-300 mt-1">{formatPrice(product.promo_price || product.price)}</p>
        {product.promo_price && (
          <p className="text-sm text-white/70 line-through">{formatPrice(product.price)}</p>
        )}
      </div>
    </div>
  )
}
