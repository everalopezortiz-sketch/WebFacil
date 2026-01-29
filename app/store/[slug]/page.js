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
import { toast } from 'sonner'
import {
  ShoppingCart, Plus, Minus, Trash2, X, ArrowLeft,
  Phone, MapPin, Store, User, Utensils, Loader2,
  MessageCircle, CreditCard, QrCode, Building, ExternalLink,
  Star, Tag, Truck, AlertTriangle
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
  const [checkoutData, setCheckoutData] = useState({})
  const [productDetail, setProductDetail] = useState(null)

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

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!products) return []
    if (selectedCategory === 'all') return products
    if (selectedCategory === 'featured') return products.filter(p => p.is_featured)
    if (selectedCategory === 'promo') return products.filter(p => p.promo_active)
    return products.filter(p => p.category_id === selectedCategory)
  }, [products, selectedCategory])

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

    setCheckoutLoading(true)
    try {
      // Create order
      const orderData = {
        userId: profile.id,
        customerName: checkoutData.name || checkoutData.nombre || 'Cliente',
        customerPhone: checkoutData.phone || checkoutData.telefono || '',
        customerEmail: checkoutData.email || '',
        customerData: checkoutData,
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
      setCheckoutOpen(false)
      setCheckoutData({})
    } catch (error) {
      toast.error('Error al procesar el pedido')
    } finally {
      setCheckoutLoading(false)
    }
  }

  // Custom styles from settings
  const customStyles = {
    '--store-bg': settings?.theme_bg_color || '#ffffff',
    '--store-text': settings?.theme_font_color || '#000000',
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
        color: 'var(--store-text)'
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-lg bg-white/80 border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-10 w-auto max-w-[120px] object-contain" />
            ) : (
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--store-button)' }}
              >
                <BusinessIcon className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg">{profile?.first_name} {profile?.last_name}</h1>
              <p className="text-xs text-gray-500">{businessConfig.title}</p>
            </div>
          </div>

          {/* Cart Button */}
          <Button
            onClick={() => setCartOpen(true)}
            className="relative"
            style={{ backgroundColor: 'var(--store-button)' }}
          >
            <ShoppingCart className="w-5 h-5" />
            {cartItemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartItemCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Location & Contact */}
      {(settings?.location_link || settings?.whatsapp_number) && (
        <div className="bg-gray-50 border-b">
          <div className="container mx-auto px-4 py-2 flex flex-wrap items-center gap-4 text-sm">
            {settings?.business_mode === 'physical' && settings?.location_link && (
              <a 
                href={settings.location_link} 
                target="_blank" 
                rel="noopener"
                className="flex items-center gap-1 text-blue-600 hover:underline"
              >
                <MapPin className="w-4 h-4" /> Ver ubicación
              </a>
            )}
            {settings?.whatsapp_number && (
              <a 
                href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-1 text-green-600 hover:underline"
              >
                <Phone className="w-4 h-4" /> WhatsApp
              </a>
            )}
            {settings?.delivery_enabled && (
              <Badge variant="secondary" className="gap-1">
                <Truck className="w-3 h-3" /> Delivery disponible
              </Badge>
            )}
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        {/* Featured Section */}
        {featuredProducts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" /> Destacados
            </h2>
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
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Tag className="w-5 h-5 text-red-500" /> Promociones
            </h2>
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
              className="whitespace-nowrap"
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Products Grid */}
        <section>
          <h2 className="text-xl font-bold mb-4">{businessConfig.productLabel}</h2>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No hay productos disponibles</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredProducts.map(product => (
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
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>Creado con WebBuilder</p>
        </div>
      </footer>

      {/* Cart Sheet */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Carrito
            </DialogTitle>
          </DialogHeader>
          
          {cart.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Tu carrito está vacío</p>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                      {item.product.image_url && (
                        <img 
                          src={item.product.image_url} 
                          alt={item.product.name}
                          className="w-16 h-16 object-cover rounded"
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
                          className="w-8 h-8"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button 
                          size="icon" 
                          variant="outline" 
                          className="w-8 h-8"
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="w-8 h-8 text-red-500"
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
              
              <div className="flex items-center justify-between font-bold text-lg">
                <span>Total:</span>
                <span>{formatPrice(cartTotal)}</span>
              </div>
              
              <DialogFooter>
                <Button 
                  className="w-full" 
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
                  ) : (
                    <Input
                      type={field.field_type === 'phone' ? 'tel' : field.field_type}
                      value={checkoutData[field.field_name] || ''}
                      onChange={(e) => setCheckoutData({ ...checkoutData, [field.field_name]: e.target.value })}
                      required={field.is_required}
                    />
                  )}
                </div>
              ))}

              {/* Payment Info */}
              {(settings?.payment_bank_account || settings?.payment_link || settings?.payment_qr_url) && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Métodos de Pago
                  </h3>
                  
                  {settings?.payment_bank_account && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg text-sm">
                      <p className="font-medium flex items-center gap-2 mb-1">
                        <Building className="w-4 h-4" /> Transferencia Bancaria
                      </p>
                      <pre className="whitespace-pre-wrap text-gray-600">{settings.payment_bank_account}</pre>
                    </div>
                  )}
                  
                  {settings?.payment_link && (
                    <a 
                      href={settings.payment_link} 
                      target="_blank" 
                      rel="noopener"
                      className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-600 hover:bg-blue-100 mb-3"
                    >
                      <ExternalLink className="w-4 h-4" /> Pagar en línea
                    </a>
                  )}
                  
                  {settings?.payment_qr_url && (
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="font-medium flex items-center justify-center gap-2 mb-2">
                        <QrCode className="w-4 h-4" /> Escanea para pagar
                      </p>
                      <img src={settings.payment_qr_url} alt="QR de pago" className="max-w-[200px] mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* Order Summary */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Resumen del Pedido</h3>
                {cart.map(item => (
                  <div key={item.product.id} className="flex justify-between text-sm py-1">
                    <span>{item.quantity}x {item.product.name}</span>
                    <span>{formatPrice(getProductPrice(item.product) * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatPrice(cartTotal)}</span>
                </div>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleCheckout} 
              disabled={checkoutLoading}
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
                <div className="aspect-video -mx-6 -mt-6 mb-4">
                  <img 
                    src={productDetail.image_url} 
                    alt={productDetail.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <DialogHeader>
                <DialogTitle>{productDetail.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {productDetail.description && (
                  <p className="text-gray-600">{productDetail.description}</p>
                )}
                <div className="flex items-center gap-2">
                  {productDetail.promo_active && productDetail.promo_price ? (
                    <>
                      <span className="text-2xl font-bold text-red-600">
                        {formatPrice(productDetail.promo_price)}
                      </span>
                      <span className="text-lg text-gray-400 line-through">
                        {formatPrice(productDetail.price)}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold">{formatPrice(productDetail.price)}</span>
                  )}
                </div>
                {productDetail.categories?.name && (
                  <Badge variant="outline">{productDetail.categories.name}</Badge>
                )}
              </div>
              <DialogFooter>
                <Button 
                  className="w-full"
                  onClick={() => { addToCart(productDetail); setProductDetail(null) }}
                  style={{ backgroundColor: 'var(--store-button)' }}
                >
                  <Plus className="w-4 h-4 mr-2" /> Agregar al Carrito
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
function ProductCard({ product, onAdd, onDetail, formatPrice, getProductPrice, buttonColor }) {
  return (
    <Card className="overflow-hidden group cursor-pointer hover:shadow-lg transition-shadow" onClick={() => onDetail(product)}>
      {product.image_url ? (
        <div className="aspect-square bg-gray-100 relative overflow-hidden">
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          {product.promo_active && (
            <Badge className="absolute top-2 right-2 bg-red-500">Oferta</Badge>
          )}
          {product.is_featured && !product.promo_active && (
            <Badge className="absolute top-2 right-2 bg-amber-500">
              <Star className="w-3 h-3" />
            </Badge>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-gray-100 flex items-center justify-center">
          <Package className="w-12 h-12 text-gray-300" />
        </div>
      )}
      <CardContent className="p-3">
        <h3 className="font-medium truncate text-sm">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{product.description}</p>
        )}
        <div className="flex items-center gap-1 mt-2">
          {product.promo_active && product.promo_price ? (
            <>
              <span className="font-bold text-red-600">{formatPrice(product.promo_price)}</span>
              <span className="text-xs text-gray-400 line-through">{formatPrice(product.price)}</span>
            </>
          ) : (
            <span className="font-bold">{formatPrice(product.price)}</span>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-3 pt-0">
        <Button 
          size="sm" 
          className="w-full"
          onClick={(e) => { e.stopPropagation(); onAdd(product) }}
          style={{ backgroundColor: buttonColor }}
        >
          <Plus className="w-4 h-4 mr-1" /> Agregar
        </Button>
      </CardFooter>
    </Card>
  )
}

// Missing icon
function Package({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15"/>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
    </svg>
  )
}
