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
  Star, Tag, Truck, Banknote, Link2, Search, Clock
} from 'lucide-react'
import { normalizeImageSrc } from '@/lib/imageUtils'

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

export default function StorePage() {
  const params = useParams()
  const slug = params.slug
  
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
  const [checkoutData, setCheckoutData] = useState({})
  const [productDetail, setProductDetail] = useState(null)
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
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
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
      {/* Header with Cover */}
      <header className="relative">
        <div className="h-44 md:h-56 relative overflow-hidden">
          {settings?.cover_image_url ? (
            <img 
              src={normalizeImageSrc(settings.cover_image_url)}
              alt="Portada"
              className="w-full h-full object-cover"
              style={{ objectPosition: 'center' }}
              onError={(e) => { 
                e.target.onerror = null
                e.target.src = ''
                e.target.parentElement.style.backgroundColor = buttonColor
              }}
            />
          ) : (
            <div className="w-full h-full" style={{ backgroundColor: buttonColor }}>
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <BusinessIcon className="w-32 h-32 text-white" />
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
        </div>
        
        {/* Profile Info */}
        <div className="container mx-auto px-4">
          <div className="flex items-end gap-4 -mt-14 relative z-10">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white shadow-xl overflow-hidden border-4 border-white flex-shrink-0">
              {settings?.logo_url ? (
                <img 
                  src={normalizeImageSrc(settings.logo_url)}
                  alt="Logo"
                  className="w-full h-full object-cover"
                  onError={(e) => { 
                    e.target.onerror = null
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                />
              ) : null}
              <div 
                className={`w-full h-full items-center justify-center ${settings?.logo_url ? 'hidden' : 'flex'}`}
                style={{ backgroundColor: buttonColor }}
              >
                <BusinessIcon className="w-12 h-12 text-white" />
              </div>
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold truncate">
                {profile.first_name} {profile.last_name}
              </h1>
              {settings?.store_description && (
                <p className="text-sm opacity-70 line-clamp-2 mt-1">{settings.store_description}</p>
              )}
              {settings?.delivery_enabled && (
                <Badge className="mt-2 bg-green-600 text-white text-xs">
                  <Truck className="w-3 h-3 mr-1" /> Delivery disponible
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur shadow-sm border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={`Buscar ${businessConfig.productLabel.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-full border-gray-200 bg-gray-50 h-10"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {settings?.whatsapp_number && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full border-green-500 text-green-600 hover:bg-green-50 gap-1.5 h-10"
                onClick={() => window.open(`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`, '_blank')}
              >
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">Contactar</span>
              </Button>
            )}
          </div>
          
          {/* Category Pills */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <Button
              size="sm"
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="rounded-full whitespace-nowrap flex-shrink-0 h-8"
              style={selectedCategory === 'all' ? { backgroundColor: buttonColor, color: 'white' } : {}}
              onClick={() => setSelectedCategory('all')}
            >
              Todos
            </Button>
            {products.some(p => p.is_featured) && (
              <Button
                size="sm"
                variant={selectedCategory === 'featured' ? 'default' : 'outline'}
                className="rounded-full whitespace-nowrap flex-shrink-0 h-8"
                style={selectedCategory === 'featured' ? { backgroundColor: '#f59e0b', color: 'white' } : {}}
                onClick={() => setSelectedCategory('featured')}
              >
                <Star className="w-3 h-3 mr-1" /> Destacados
              </Button>
            )}
            {products.some(p => p.promo_active) && (
              <Button
                size="sm"
                variant={selectedCategory === 'promo' ? 'default' : 'outline'}
                className="rounded-full whitespace-nowrap flex-shrink-0 h-8"
                style={selectedCategory === 'promo' ? { backgroundColor: '#ef4444', color: 'white' } : {}}
                onClick={() => setSelectedCategory('promo')}
              >
                <Tag className="w-3 h-3 mr-1" /> Ofertas
              </Button>
            )}
            {categories.map(cat => (
              <Button
                key={cat.id}
                size="sm"
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                className="rounded-full whitespace-nowrap flex-shrink-0 h-8"
                style={selectedCategory === cat.id ? { backgroundColor: buttonColor, color: 'white' } : {}}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 pb-28 flex-1">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg opacity-60">No hay {businessConfig.productLabel.toLowerCase()} disponibles</p>
            {searchQuery && <p className="text-sm opacity-40 mt-2">No se encontraron resultados para "{searchQuery}"</p>}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Show by category when "all" is selected */}
            {selectedCategory === 'all' ? (
              <>
                {/* Featured */}
                {products.some(p => p.is_featured) && (
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-500" /> Destacados
                    </h2>
                    <ProductGrid 
                      products={products.filter(p => p.is_featured)} 
                      {...{ addToCart, setProductDetail, formatPrice, getProductPrice, buttonColor, cardSize, gridColumns }}
                    />
                  </section>
                )}
                
                {/* By Category */}
                {categories.map(cat => {
                  const catProducts = products.filter(p => p.category_id === cat.id && !p.is_featured)
                  if (catProducts.length === 0) return null
                  return (
                    <section key={cat.id}>
                      <h2 className="text-lg font-bold mb-4">{cat.name}</h2>
                      <ProductGrid 
                        products={catProducts} 
                        {...{ addToCart, setProductDetail, formatPrice, getProductPrice, buttonColor, cardSize, gridColumns }}
                      />
                    </section>
                  )
                })}
                
                {/* Uncategorized */}
                {products.filter(p => !p.category_id && !p.is_featured).length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold mb-4">Otros</h2>
                    <ProductGrid 
                      products={products.filter(p => !p.category_id && !p.is_featured)} 
                      {...{ addToCart, setProductDetail, formatPrice, getProductPrice, buttonColor, cardSize, gridColumns }}
                    />
                  </section>
                )}
              </>
            ) : (
              <section>
                <h2 className="text-lg font-bold mb-4">
                  {selectedCategory === 'promo' ? 'Ofertas' : 
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
        {(settings?.business_hours || settings?.shipping_info) && (
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {settings?.business_hours && (
              <Card className="bg-white/80 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5" style={{ color: buttonColor }} />
                    <h3 className="font-semibold">Horario de Atención</h3>
                  </div>
                  <p className="text-sm opacity-70 whitespace-pre-line">{settings.business_hours}</p>
                </CardContent>
              </Card>
            )}
            {settings?.shipping_info && (
              <Card className="bg-white/80 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="w-5 h-5" style={{ color: buttonColor }} />
                    <h3 className="font-semibold">Envíos y Entregas</h3>
                  </div>
                  <p className="text-sm opacity-70 whitespace-pre-line">{settings.shipping_info}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center text-center gap-4">
            <div>
              <p className="text-lg font-semibold text-amber-400">{globalSettings.name || 'webFácil'}</p>
              {settings?.delivery_enabled && (
                <p className="text-xs text-green-400 flex items-center gap-1 justify-center mt-1">
                  <Truck className="w-3 h-3" /> Delivery disponible
                </p>
              )}
            </div>
            {globalSettings.whatsapp && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm opacity-80">¿Querés tu web gratis? Escribinos</p>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white border-0"
                  onClick={() => window.open(`https://wa.me/${globalSettings.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hola! Quiero mi web gratis')}`, '_blank')}
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> Contactar
                </Button>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
          <Button
            className="w-full py-6 rounded-2xl shadow-2xl text-white font-semibold text-lg"
            style={{ backgroundColor: buttonColor }}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            Ver Carrito ({cartCount}) - {formatPrice(cartTotal)}
          </Button>
        </div>
      )}

      {/* Product Detail Dialog */}
      <Dialog open={!!productDetail} onOpenChange={() => setProductDetail(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {productDetail && (
            <>
              {productDetail.image_url && (
                <div className="aspect-video bg-gray-100">
                  <img 
                    src={normalizeImageSrc(productDetail.image_url)}
                    alt={productDetail.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
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
                  <Button style={{ backgroundColor: buttonColor }} className="text-white" onClick={() => { addToCart(productDetail); setProductDetail(null) }}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar
                  </Button>
                </div>
              </div>
            </>
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
                  {item.image_url && (
                    <img src={normalizeImageSrc(item.image_url)} alt={item.name} className="w-16 h-16 rounded-lg object-cover" onError={(e) => e.target.style.display = 'none'} />
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
      {products.map(product => (
        <div 
          key={product.id}
          className="bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all border border-gray-100"
          onClick={() => setProductDetail(product)}
        >
          <div className={`${imageHeight} bg-gray-100 relative`}>
            {product.image_url ? (
              <img 
                src={normalizeImageSrc(product.image_url)}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <Store className="w-10 h-10 text-gray-300" />
              </div>
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
                className="h-8 w-8 rounded-full p-0 text-white"
                style={{ backgroundColor: buttonColor }}
                onClick={(e) => { e.stopPropagation(); addToCart(product) }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
