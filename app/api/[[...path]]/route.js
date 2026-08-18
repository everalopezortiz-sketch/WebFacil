import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'
import { handleBookingRoute } from '@/lib/booking/api'
import { handleDiagnosticsRoute } from '@/lib/diagnostics/api'

// Route segment config - allow custom Cache-Control headers
export const dynamic = 'force-dynamic'

// Create Supabase client for server-side operations (with user context)
function createSupabaseServer(authHeader) {
  const cookieStore = cookies()
  const options = {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server component cookie handling
        }
      },
    },
  }
  // If a Bearer token is provided (from client authFetch), use it for auth.
  // This makes auth work even when the session cookie is stale/expired,
  // because the browser client always sends a freshly-refreshed access token.
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.length > 20) {
    options.global = { headers: { Authorization: authHeader } }
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options
  )
}

// Create Supabase Admin client (bypasses RLS)
function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Deduct stock for a sold item. If the product is a COMBO (has rows in
// combo_items), deduct each component's stock instead of the combo itself.
// Robust to missing combo_items table (pre-migration).
async function deductStockForItem(supabaseAdmin, productId, quantity) {
  if (!productId) return
  const qty = quantity || 0
  let comps = []
  try {
    const { data } = await supabaseAdmin
      .from('combo_items')
      .select('component_product_id, quantity')
      .eq('combo_product_id', productId)
    comps = data || []
  } catch (e) { /* table may not exist yet */ }

  if (comps.length > 0) {
    for (const c of comps) {
      const { data: cp } = await supabaseAdmin.from('products').select('stock_quantity').eq('id', c.component_product_id).single()
      if (cp && cp.stock_quantity !== null && cp.stock_quantity !== undefined) {
        await supabaseAdmin.from('products').update({ stock_quantity: Math.max(0, cp.stock_quantity - (c.quantity || 1) * qty) }).eq('id', c.component_product_id)
      }
    }
    return
  }
  const { data: prod } = await supabaseAdmin.from('products').select('stock_quantity').eq('id', productId).single()
  if (prod && prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
    await supabaseAdmin.from('products').update({ stock_quantity: Math.max(0, prod.stock_quantity - qty) }).eq('id', productId)
  }
}

// CORS headers
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

// Public column selects (minimize data transfer)
const PRODUCT_PUBLIC_SELECT = 'id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,stock_quantity,categories(name)'
const PROFILE_PUBLIC_SELECT = 'id,first_name,last_name,business_type,slug,maintenance_mode'
const CATEGORY_PUBLIC_SELECT = 'id,name'
const CHECKOUT_PUBLIC_SELECT = 'id,field_name,field_label,field_type,is_required,options,display_order'

// Allowed product fields accepted from client body (never trust user_id/timestamps/joins)
const PRODUCT_ALLOWED_FIELDS = [
  'name', 'description', 'price', 'image_url', 'category_id',
  'promo_price', 'promo_active', 'is_featured', 'is_active',
  'stock_quantity', 'display_order', 'cost_price', 'is_combo'
]
function pickProductFields(body) {
  const out = {}
  PRODUCT_ALLOWED_FIELDS.forEach(f => { if (body[f] !== undefined) out[f] = body[f] })
  if (out.category_id === 'none' || out.category_id === '') out.category_id = null
  if (out.stock_quantity === '' || out.stock_quantity === undefined) out.stock_quantity = null
  // Only coerce cost_price when the field is actually present in the body.
  // If it's undefined (partial update), leave it out so we never overwrite the saved cost with 0.
  if (out.cost_price === '' || out.cost_price === null) out.cost_price = 0
  else if (out.cost_price !== undefined) out.cost_price = parseFloat(out.cost_price) || 0
  return out
}

// Persist combo components for a product (replace all). Robust to missing table.
async function saveComboItems(supabaseAdmin, comboProductId, userId, comboItems) {
  if (!Array.isArray(comboItems)) return
  try {
    await supabaseAdmin.from('combo_items').delete().eq('combo_product_id', comboProductId)
    const rows = comboItems
      .filter(ci => ci.component_product_id && ci.component_product_id !== comboProductId)
      .map(ci => ({
        combo_product_id: comboProductId,
        component_product_id: ci.component_product_id,
        quantity: parseFloat(ci.quantity) || 1,
        user_id: userId
      }))
    if (rows.length > 0) await supabaseAdmin.from('combo_items').insert(rows)
  } catch (e) { console.error('saveComboItems error:', e?.message) }
}

// Add CDN cache headers to PUBLIC (non-private) responses only
function handlePublicCache(response, maxAge = 60) {
  response.headers.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=300`)
  response.headers.set('CDN-Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=300`)
  response.headers.set('Vercel-CDN-Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=300`)
  return handleCORS(response)
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

export async function GET(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer(request.headers.get('Authorization'))
  const supabaseAdmin = createSupabaseAdmin()
  const { searchParams } = new URL(request.url)

  try {
    // Booking module dispatcher (authenticated + public booking routes)
    const bookingRes = await handleBookingRoute({ method: 'GET', supabase, supabaseAdmin, path, pathStr, searchParams })
    if (bookingRes) return handleCORS(bookingRes)

    // Diagnostics module dispatcher (Fichas capilares)
    const diagRes = await handleDiagnosticsRoute({ method: 'GET', supabase, supabaseAdmin, path, pathStr, searchParams, authHeader: request.headers.get('Authorization') })
    if (diagRes) return handleCORS(diagRes)

    // Health check
    if (pathStr === 'health') {
      return handleCORS(NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }))
    }

    // Get current user
    if (pathStr === 'auth/user') {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        return handleCORS(NextResponse.json({ user: null }, { status: 200 }))
      }
      
      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      return handleCORS(NextResponse.json({ user, profile }))
    }

    // Get user settings
    if (pathStr === 'settings') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()
      
      return handleCORS(NextResponse.json(data || {}))
    }

    // Get categories
    if (pathStr === 'categories') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get products
    if (pathStr === 'products') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('products')
        .select('id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,cost_price,is_combo,createdAt,categories(name)')
        .eq('user_id', user.id)
        .order('createdAt', { ascending: false })
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get orders
    if (pathStr === 'orders') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const dateFilter = searchParams.get('date')
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.id)
        .order('createdAt', { ascending: false })
      
      if (dateFilter) {
        const startOfDay = new Date(dateFilter)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(dateFilter)
        endOfDay.setHours(23, 59, 59, 999)
        query = query.gte('createdAt', startOfDay.toISOString()).lte('createdAt', endOfDay.toISOString())
      }
      
      const { data, error } = await query
      return handleCORS(NextResponse.json(data || []))
    }

    // Get checkout fields
    if (pathStr === 'checkout-fields') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('checkout_fields')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get plans
    if (pathStr === 'plans') {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get user plan
    if (pathStr === 'user-plan') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('user_plans')
        .select('*, plans(*)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      
      return handleCORS(NextResponse.json(data || null))
    }

    // Get support messages
    if (pathStr === 'messages') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .order('createdAt', { ascending: false })
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get global software settings (for login page)
    if (pathStr === 'global-settings') {
      try {
        // Try to get from info_content by title
        const { data, error } = await supabaseAdmin
          .from('info_content')
          .select('description')
          .eq('title', 'GLOBAL_SOFTWARE_SETTINGS')
          .single()
        
        if (data && data.description) {
          try {
            const settings = JSON.parse(data.description)
            return handlePublicCache(NextResponse.json(settings), 300)
          } catch (e) {
            return handlePublicCache(NextResponse.json({ name: 'webFácil' }), 300)
          }
        }
      } catch (e) {
        console.log('Global settings not found')
      }
      return handlePublicCache(NextResponse.json({ name: 'webFácil' }), 300)
    }

    // Admin: Get all sent messages
    if (pathStr === 'admin/messages-list') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { data, error } = await supabaseAdmin
        .from('support_messages')
        .select('*')
        .order('createdAt', { ascending: false })
      
      if (error) {
        console.error('Messages list error:', error)
        return handleCORS(NextResponse.json([]))
      }
      return handleCORS(NextResponse.json(data || []))
    }

    // Admin: Get messages for specific user
    if (pathStr.startsWith('admin/user-messages/')) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const userId = path[2]
      const { data, error } = await supabaseAdmin
        .from('support_messages')
        .select('*')
        .or(`user_id.eq.${userId},is_global.eq.true`)
        .order('createdAt', { ascending: false })
      
      if (error) {
        console.error('User messages error:', error)
        return handleCORS(NextResponse.json([]))
      }
      return handleCORS(NextResponse.json(data || []))
    }

    // Get info content
    if (pathStr === 'info-content') {
      const { data, error } = await supabase
        .from('info_content')
        .select('*')
        .eq('is_active', true)
      
      return handleCORS(NextResponse.json(data || []))
    }

    // Get reports
    if (pathStr === 'reports') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      
      // Only count delivered orders for reports
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('user_id', user.id)
        .eq('status', 'delivered')
      
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        query = query.gte('createdAt', start.toISOString())
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query = query.lte('createdAt', end.toISOString())
      }
      
      const { data: orders } = await query
      
      // Calculate top products with profit (revenue - cost)
      const productSales = {}
      orders?.forEach(order => {
        order.order_items?.forEach(item => {
          const key = item.product_name
          if (!productSales[key]) {
            productSales[key] = { quantity: 0, revenue: 0, cost: 0, profit: 0 }
          }
          const qty = parseFloat(item.quantity) || 0
          const rev = parseFloat(item.subtotal) || 0
          const cost = (parseFloat(item.cost_price) || 0) * qty
          productSales[key].quantity += qty
          productSales[key].revenue += rev
          productSales[key].cost += cost
          productSales[key].profit += (rev - cost)
        })
      })
      
      const topProducts = Object.entries(productSales)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 20)
      
      const totalRevenue = orders?.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0) || 0
      const totalCost = Object.values(productSales).reduce((s, p) => s + p.cost, 0)
      const totalDiscount = orders?.reduce((sum, o) => sum + (parseFloat(o.discount) || 0), 0) || 0
      const totalProfit = totalRevenue - totalCost
      const totalOrders = orders?.length || 0
      
      return handleCORS(NextResponse.json({ orders, topProducts, totalRevenue, totalCost, totalProfit, totalDiscount, totalOrders }))
    }

    // Get dashboard stats (visits, sales day/week, low stock)
    if (pathStr === 'dashboard-stats') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

      const now = new Date()
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
      const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 6)

      // Visits
      let visitsTotal = 0, visitsToday = 0, visitsWeek = 0
      let visitsByDay = []
      try {
        const { data: visits } = await supabaseAdmin
          .from('store_visits')
          .select('created_at')
          .eq('user_id', user.id)
          .gte('created_at', startOfWeek.toISOString())
        const { count: totalCount } = await supabaseAdmin
          .from('store_visits')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
        visitsTotal = totalCount || 0
        const dayMap = {}
        for (let i = 6; i >= 0; i--) {
          const d = new Date(startOfToday); d.setDate(d.getDate() - i)
          dayMap[d.toISOString().split('T')[0]] = 0
        }
        ;(visits || []).forEach(v => {
          const key = new Date(v.created_at).toISOString().split('T')[0]
          if (dayMap[key] !== undefined) dayMap[key]++
          if (new Date(v.created_at) >= startOfToday) visitsToday++
        })
        visitsWeek = (visits || []).length
        visitsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }))
      } catch (e) { /* table may not exist */ }

      // Sales (delivered orders)
      const { data: weekOrders } = await supabaseAdmin
        .from('orders')
        .select('total, createdAt, status')
        .eq('user_id', user.id)
        .eq('status', 'delivered')
        .gte('createdAt', startOfWeek.toISOString())

      const salesDayMap = {}
      for (let i = 6; i >= 0; i--) {
        const d = new Date(startOfToday); d.setDate(d.getDate() - i)
        salesDayMap[d.toISOString().split('T')[0]] = 0
      }
      let salesToday = 0, salesWeek = 0, ordersToday = 0
      ;(weekOrders || []).forEach(o => {
        const key = new Date(o.createdAt).toISOString().split('T')[0]
        const amt = parseFloat(o.total) || 0
        if (salesDayMap[key] !== undefined) salesDayMap[key] += amt
        salesWeek += amt
        if (new Date(o.createdAt) >= startOfToday) { salesToday += amt; ordersToday++ }
      })
      const salesByDay = Object.entries(salesDayMap).map(([date, total]) => ({ date, total }))

      // Low stock products
      const { data: lowStock } = await supabaseAdmin
        .from('products')
        .select('id, name, stock_quantity')
        .eq('user_id', user.id)
        .not('stock_quantity', 'is', null)
        .lte('stock_quantity', 5)
        .order('stock_quantity', { ascending: true })

      return handleCORS(NextResponse.json({
        visitsTotal, visitsToday, visitsWeek, visitsByDay,
        salesToday, salesWeek, ordersToday, salesByDay,
        lowStock: lowStock || []
      }))
    }

    // Get materials (with current stock) for the authenticated user
    if (pathStr === 'materials') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { data, error } = await supabaseAdmin
        .from('materials')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true })
      if (error) return handleCORS(NextResponse.json([]))
      return handleCORS(NextResponse.json(data || []))
    }

    // Get movements of a material
    if (path[0] === 'materials' && path[2] === 'movements') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { data } = await supabaseAdmin
        .from('material_movements')
        .select('*')
        .eq('material_id', path[1])
        .eq('user_id', user.id)
        .order('createdAt', { ascending: false })
        .limit(100)
      return handleCORS(NextResponse.json(data || []))
    }

    // Get combo components for a product
    if (path[0] === 'products' && path[2] === 'combo') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { data: comps } = await supabaseAdmin
        .from('combo_items')
        .select('*')
        .eq('combo_product_id', path[1])
      const rows = comps || []
      if (rows.length > 0) {
        const ids = rows.map(r => r.component_product_id)
        const { data: prods } = await supabaseAdmin.from('products').select('id,name,stock_quantity,price').in('id', ids)
        const map = {}
        ;(prods || []).forEach(p => { map[p.id] = p })
        rows.forEach(r => { r.component = map[r.component_product_id] || null })
      }
      return handleCORS(NextResponse.json(rows))
    }

    // ADMIN: view another user's dashboard data (read-only, no login needed)
    if (path[0] === 'admin' && path[1] === 'user-dashboard' && path[2]) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      const targetId = path[2]
      const [profileRes, settingsRes, productsRes, ordersRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').eq('id', targetId).single(),
        supabaseAdmin.from('user_settings').select('*').eq('user_id', targetId).single(),
        supabaseAdmin.from('products').select('id,name,price,promo_price,promo_active,stock_quantity,cost_price,is_featured,image_url,categories(name)').eq('user_id', targetId).order('createdAt', { ascending: false }),
        supabaseAdmin.from('orders').select('*, order_items(*)').eq('user_id', targetId).order('createdAt', { ascending: false }).limit(200)
      ])
      const orders = ordersRes?.data || []
      const delivered = orders.filter(o => o.status === 'delivered')
      const totalRevenue = delivered.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
      let totalCost = 0
      const productSales = {}
      delivered.forEach(o => (o.order_items || []).forEach(it => {
        const qty = parseFloat(it.quantity) || 0
        const rev = parseFloat(it.subtotal) || 0
        const cost = (parseFloat(it.cost_price) || 0) * qty
        totalCost += cost
        if (!productSales[it.product_name]) productSales[it.product_name] = { quantity: 0, revenue: 0, profit: 0 }
        productSales[it.product_name].quantity += qty
        productSales[it.product_name].revenue += rev
        productSales[it.product_name].profit += (rev - cost)
      }))
      const topProducts = Object.entries(productSales).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue).slice(0, 20)
      return handleCORS(NextResponse.json({
        profile: profileRes?.data,
        settings: settingsRes?.data,
        products: productsRes?.data || [],
        orders,
        stats: {
          totalRevenue, totalCost, totalProfit: totalRevenue - totalCost,
          totalOrders: delivered.length, productCount: (productsRes?.data || []).length,
          pendingBalance: orders.filter(o => o.status !== 'delivered').reduce((s, o) => s + (parseFloat(o.balance_due) || 0), 0)
        },
        topProducts
      }))
    }

    // ============ ADMIN ROUTES ============
    
    // Get all users (admin)
    if (pathStr === 'admin/users') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const search = searchParams.get('search')
      const type = searchParams.get('type')
      
      let query = supabase
        .from('profiles')
        .select('*, user_settings(*), user_plans(*, plans(*))')
        .order('createdAt', { ascending: false })
      
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
      }
      if (type) query = query.eq('business_type', type)
      
      const { data, error } = await query
      return handleCORS(NextResponse.json(data || []))
    }

    // ============ PUBLIC STORE ROUTES ============
    
    // Get store by slug (use admin client to bypass RLS for public access)
    if (pathStr.startsWith('store/')) {
      const slug = path[1]
      const supabaseAdmin = createSupabaseAdmin()
      
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select(PROFILE_PUBLIC_SELECT)
        .eq('slug', slug)
        .eq('is_active', true)
        .single()
      
      if (!profile) {
        return handleCORS(NextResponse.json({ error: 'Store not found' }, { status: 404 }))
      }
      
      if (profile.maintenance_mode) {
        return handleCORS(NextResponse.json({ error: 'Store in maintenance', maintenance: true }, { status: 503 }))
      }
      
      // Run all queries in parallel to reduce latency (visit tracking is a separate POST)
      const [settingsRes, categoriesRes, productsRes, checkoutRes] = await Promise.all([
        supabaseAdmin.from('user_settings').select('*').eq('user_id', profile.id).single(),
        supabaseAdmin.from('categories').select(CATEGORY_PUBLIC_SELECT).eq('user_id', profile.id).eq('is_active', true).order('display_order'),
        supabaseAdmin.from('products').select(PRODUCT_PUBLIC_SELECT).eq('user_id', profile.id).eq('is_active', true).order('createdAt', { ascending: false }),
        supabaseAdmin.from('checkout_fields').select(CHECKOUT_PUBLIC_SELECT).eq('user_id', profile.id).eq('is_active', true).order('display_order')
      ])

      const settings = settingsRes?.data
      const categories = categoriesRes?.data
      const products = productsRes?.data
      const checkoutFields = checkoutRes?.data

      const payload = {
        profile,
        settings,
        categories,
        products,
        checkoutFields
      }

      // If a critical query failed (e.g. DB paused / transient error), DO NOT
      // let the CDN cache a broken/empty response — it would keep serving the
      // empty store for minutes. Return with no-store so the next request retries.
      const criticalError = productsRes?.error || settingsRes?.error
      if (criticalError) {
        console.error('Store fetch partial error:', criticalError?.message)
        const res = NextResponse.json(payload)
        res.headers.set('Cache-Control', 'no-store')
        return handleCORS(res)
      }

      // Public store data has no private info -> cache 60s at the CDN
      return handlePublicCache(NextResponse.json(payload), 60)
    }

    return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function POST(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer(request.headers.get('Authorization'))
  const supabaseAdmin = createSupabaseAdmin()

  try {
    let body = {}
    try {
      body = await request.json()
    } catch (e) {
      // Body might be empty for some requests like signout
    }

    // Booking module dispatcher (authenticated + public booking routes)
    const bookingRes = await handleBookingRoute({ method: 'POST', supabase, supabaseAdmin, path, pathStr, body, searchParams: new URL(request.url).searchParams })
    if (bookingRes) return handleCORS(bookingRes)

    // Diagnostics module dispatcher (Fichas capilares)
    const diagRes = await handleDiagnosticsRoute({ method: 'POST', supabase, supabaseAdmin, path, pathStr, body, searchParams: new URL(request.url).searchParams, authHeader: request.headers.get('Authorization') })
    if (diagRes) return handleCORS(diagRes)

    // Public: register a store visit (max 1 per browser per day via cookie)
    if (path[0] === 'store' && path[2] === 'visit') {
      const slug = path[1]
      const cookieName = `wf_visit_${slug}`
      const alreadyVisited = cookies().get(cookieName)
      if (alreadyVisited) {
        return handleCORS(NextResponse.json({ counted: false }))
      }
      try {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('slug', slug)
          .eq('is_active', true)
          .single()
        if (prof) {
          await supabaseAdmin.from('store_visits').insert({ user_id: prof.id }).then(() => {}, () => {})
        }
      } catch (e) { /* ignore */ }
      const res = NextResponse.json({ counted: true })
      res.cookies.set(cookieName, '1', {
        maxAge: 60 * 60 * 24,
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
      })
      return handleCORS(res)
    }

    // Sign up
    if (pathStr === 'auth/signup') {
      const { email, password, firstName, lastName, city, country, phone, businessType } = body
      
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName }
        }
      })
      
      if (authError) {
        return handleCORS(NextResponse.json({ error: authError.message }, { status: 400 }))
      }
      
      // Check if this is the first user (make them admin) - use admin client
      const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
      const role = count === 0 ? 'DESARROLLADOR' : 'USER'
      
      // Generate unique slug
      const baseSlug = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '-')
      const slug = `${baseSlug}-${Date.now().toString(36)}`
      
      // Create profile using admin client (bypasses RLS)
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        city,
        country,
        phone,
        business_type: businessType,
        role,
        slug,
        is_active: true
      })
      
      if (profileError) {
        console.error('Profile creation error:', profileError)
        return handleCORS(NextResponse.json({ error: profileError.message }, { status: 400 }))
      }

      // Store a plaintext copy of the password so the admin can view it later.
      // Separate update so a missing column (pre-migration) never breaks signup.
      try {
        await supabaseAdmin.from('profiles').update({ plain_password: password }).eq('id', authData.user.id)
      } catch (e) { /* column may not exist yet */ }
      
      // Create default settings using admin client
      await supabaseAdmin.from('user_settings').insert({
        user_id: authData.user.id,
        currency: 'USD'
      })
      
      // Create default checkout fields using admin client
      const defaultFields = [
        { user_id: authData.user.id, field_name: 'name', field_label: 'Nombre completo', field_type: 'text', is_required: true, display_order: 1 },
        { user_id: authData.user.id, field_name: 'phone', field_label: 'Teléfono', field_type: 'phone', is_required: true, display_order: 2 },
        { user_id: authData.user.id, field_name: 'email', field_label: 'Email', field_type: 'email', is_required: false, display_order: 3 },
        { user_id: authData.user.id, field_name: 'address', field_label: 'Dirección', field_type: 'textarea', is_required: false, display_order: 4 }
      ]
      await supabaseAdmin.from('checkout_fields').insert(defaultFields)
      
      // For booking (Agendamientos + Tienda) accounts, seed booking config + initial staff.
      // Do NOT create schedules automatically (the onboarding wizard handles that).
      if (businessType === 'booking') {
        try {
          await supabaseAdmin.from('booking_settings').insert({
            user_id: authData.user.id,
            timezone: 'America/Asuncion',
            slot_interval_minutes: 30,
            min_booking_notice_minutes: 60,
            max_advance_days: 60,
            auto_confirm: true,
            allow_staff_choice: true,
            allow_multiple_services: true,
            require_phone: true,
            whatsapp_notifications: true,
            week_starts_on: 1
          })
          await supabaseAdmin.from('booking_staff').insert({
            user_id: authData.user.id,
            name: 'Profesional principal',
            color: '#7c3aed',
            display_order: 0,
            is_active: true
          })
        } catch (e) { console.error('booking seed error:', e?.message) }
      }
      
      return handleCORS(NextResponse.json({ user: authData.user, role, message: 'Account created successfully' }))
    }

    // Sign in
    if (pathStr === 'auth/signin') {
      const { email, password } = body
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        return handleCORS(NextResponse.json({ error: error.message }, { status: 401 }))
      }
      
      // Use admin client to get profile (bypasses RLS)
      let { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      
      // If profile doesn't exist (user created from Supabase dashboard), create it
      if (!profile) {
        // Check if this is the first user (make them admin)
        const { count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
        const role = count === 0 ? 'DESARROLLADOR' : 'USER'
        
        // Generate unique slug
        const baseSlug = `user-${Date.now().toString(36)}`
        
        // Create profile with default values using admin client
        const { data: newProfile, error: profileError } = await supabaseAdmin.from('profiles').insert({
          id: data.user.id,
          email: data.user.email,
          first_name: data.user.user_metadata?.first_name || 'Usuario',
          last_name: data.user.user_metadata?.last_name || '',
          city: 'No especificada',
          country: 'No especificado',
          phone: '',
          business_type: 'ecommerce',
          role,
          slug: baseSlug,
          is_active: true
        }).select().single()
        
        if (profileError) {
          console.error('Profile creation error:', profileError)
          await supabase.auth.signOut()
          return handleCORS(NextResponse.json({ error: 'Error creating profile' }, { status: 500 }))
        }
        
        profile = newProfile
        
        // Create default settings using admin client
        await supabaseAdmin.from('user_settings').insert({
          user_id: data.user.id,
          currency: 'USD'
        })
        
        // Create default checkout fields using admin client
        const defaultFields = [
          { user_id: data.user.id, field_name: 'name', field_label: 'Nombre completo', field_type: 'text', is_required: true, display_order: 1 },
          { user_id: data.user.id, field_name: 'phone', field_label: 'Teléfono', field_type: 'phone', is_required: true, display_order: 2 },
          { user_id: data.user.id, field_name: 'email', field_label: 'Email', field_type: 'email', is_required: false, display_order: 3 },
          { user_id: data.user.id, field_name: 'address', field_label: 'Dirección', field_type: 'textarea', is_required: false, display_order: 4 }
        ]
        await supabaseAdmin.from('checkout_fields').insert(defaultFields)
      }
      
      // Check if account is disabled
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut()
        return handleCORS(NextResponse.json({ error: 'Account is disabled' }, { status: 403 }))
      }
      
      return handleCORS(NextResponse.json({ user: data.user, profile }))
    }

    // Sign out
    if (pathStr === 'auth/signout') {
      await supabase.auth.signOut()
      return handleCORS(NextResponse.json({ message: 'Signed out' }))
    }

    // Update settings - use admin client to bypass RLS
    if (pathStr === 'settings') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      // Include all fields that exist in the database schema
      const allowedFields = [
        'user_id', 'store_name', 'logo_url', 'cover_image_url', 'theme_bg_color', 'theme_font_color', 'theme_button_color',
        'bg_pattern', 'currency', 'business_mode', 'location_link', 'delivery_enabled',
        'payment_cash_enabled', 'payment_bank_account', 'payment_bank_enabled',
        'payment_link', 'payment_link_enabled', 'payment_qr_url', 'payment_qr_enabled',
        'whatsapp_number', 'store_description', 'business_hours', 'shipping_info',
        'card_size', 'grid_columns', 'products_per_page'
      ]
      
      const cleanBody = { user_id: user.id }
      allowedFields.forEach(field => {
        if (body[field] !== undefined) {
          cleanBody[field] = body[field]
        }
      })
      
      let { data, error } = await supabaseAdmin
        .from('user_settings')
        .upsert(cleanBody, { onConflict: 'user_id' })
        .select()
        .single()
      
      // Fallback: if store_name column doesn't exist yet, retry without it
      if (error && /store_name/i.test(error.message || '')) {
        const { store_name, ...rest } = cleanBody
        ;({ data, error } = await supabaseAdmin
          .from('user_settings')
          .upsert(rest, { onConflict: 'user_id' })
          .select()
          .single())
      }
      
      if (error) {
        console.error('Settings update error:', error)
        return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      }
      return handleCORS(NextResponse.json(data))
    }

    // Create category - use admin client
    if (pathStr === 'categories') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabaseAdmin
        .from('categories')
        .insert({ ...body, user_id: user.id })
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Create product - use admin client
    if (pathStr === 'products') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      // Whitelist fields; never trust user_id/timestamps/joins from client
      const productData = { ...pickProductFields(body), user_id: user.id }
      const SELECT_COLS = 'id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,createdAt,categories(name)'
      const SELECT_COLS_FULL = 'id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,cost_price,is_combo,createdAt,categories(name)'

      let { data, error } = await supabaseAdmin
        .from('products')
        .insert(productData)
        .select(SELECT_COLS_FULL)
        .single()

      // Fallback if new columns (cost_price/is_combo) don't exist yet
      if (error) {
        const { cost_price, is_combo, ...safe } = productData
        ;({ data, error } = await supabaseAdmin.from('products').insert(safe).select(SELECT_COLS).single())
      }
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))

      // Save combo components if provided
      if (data?.id && Array.isArray(body.combo_items)) {
        await saveComboItems(supabaseAdmin, data.id, user.id, body.combo_items)
      }
      return handleCORS(NextResponse.json(data))
    }

    // Create checkout field - use admin client
    if (pathStr === 'checkout-fields') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data, error } = await supabaseAdmin
        .from('checkout_fields')
        .insert({ ...body, user_id: user.id })
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Create order (public) - use admin client to bypass RLS
    if (pathStr === 'orders') {
      const { userId, customerName, customerPhone, customerEmail, customerData, items, total, notes } = body
      
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`
      
      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .insert({
          user_id: userId,
          order_number: orderNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          customer_data: customerData,
          total,
          notes
        })
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      
      // Insert order items using admin client
      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal
      }))
      
      await supabaseAdmin.from('order_items').insert(orderItems)
      
      // Deduct stock for products that track inventory (combo-aware)
      try {
        for (const item of items) {
          await deductStockForItem(supabaseAdmin, item.productId, item.quantity || 0)
        }
      } catch (stockErr) {
        console.error('Stock deduction error:', stockErr)
      }
      
      return handleCORS(NextResponse.json({ order, orderNumber }))
    }

    // Create manual sale (authenticated dashboard) - marked delivered so it counts in reports
    if (pathStr === 'orders/manual') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

      const { customerName, description, items, total, saleDate, deductStock, deposit, discount, status } = body
      const orderNumber = `VTA-${Date.now().toString(36).toUpperCase()}`

      const totalNum = parseFloat(total) || 0
      const depositNum = parseFloat(deposit) || 0
      const discountNum = parseFloat(discount) || 0
      // status flow: pending/preparing (con seña) -> delivered (pagado completo)
      const orderStatus = status || 'delivered'
      const isDelivered = orderStatus === 'delivered'
      const balanceDue = isDelivered ? 0 : Math.max(0, totalNum - depositNum)
      const paymentStatus = isDelivered ? 'paid' : (depositNum > 0 ? 'partial' : 'pending')

      const insertData = {
        user_id: user.id,
        order_number: orderNumber,
        customer_name: customerName || 'Venta directa',
        status: orderStatus,
        total: totalNum,
        notes: description || null,
        deposit: depositNum,
        discount: discountNum,
        balance_due: balanceDue,
        payment_status: paymentStatus
      }
      // Allow backdating the sale
      if (saleDate) {
        const d = new Date(saleDate)
        if (!isNaN(d.getTime())) insertData.createdAt = d.toISOString()
      }

      let order, error
      ;({ data: order, error } = await supabaseAdmin.from('orders').insert(insertData).select().single())
      // Fallback if new columns don't exist yet (pre-migration)
      if (error) {
        const minimal = { user_id: user.id, order_number: orderNumber, customer_name: insertData.customer_name, status: orderStatus, total: totalNum, notes: description || null }
        if (insertData.createdAt) minimal.createdAt = insertData.createdAt
        ;({ data: order, error } = await supabaseAdmin.from('orders').insert(minimal).select().single())
      }
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))

      if (Array.isArray(items) && items.length > 0) {
        const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.productId || null,
          product_name: item.productName,
          quantity: item.quantity || 1,
          unit_price: item.unitPrice || 0,
          subtotal: item.subtotal != null ? item.subtotal : (item.unitPrice || 0) * (item.quantity || 1),
          cost_price: item.costPrice != null ? item.costPrice : 0,
          original_price: item.originalPrice != null ? item.originalPrice : (item.unitPrice || 0)
        }))
        let itErr
        ;({ error: itErr } = await supabaseAdmin.from('order_items').insert(orderItems))
        if (itErr) {
          // retry without new columns (pre-migration)
          const oi = orderItems.map(({ cost_price, original_price, ...rest }) => rest)
          await supabaseAdmin.from('order_items').insert(oi)
        }

        // Optionally deduct stock (combo-aware)
        if (deductStock) {
          for (const item of items) {
            await deductStockForItem(supabaseAdmin, item.productId, item.quantity || 0)
          }
        }
      }

      return handleCORS(NextResponse.json({ order, orderNumber }))
    }
    // Create material (stock de materiales)
    if (pathStr === 'materials') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { name, unit, stock_quantity, unit_cost } = body
      if (!name) return handleCORS(NextResponse.json({ error: 'Nombre requerido' }, { status: 400 }))
      const { data, error } = await supabaseAdmin
        .from('materials')
        .insert({ user_id: user.id, name, unit: unit || 'un', stock_quantity: parseFloat(stock_quantity) || 0, unit_cost: parseFloat(unit_cost) || 0 })
        .select().single()
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Register a material movement (purchase adds stock, usage deducts)
    if (path[0] === 'materials' && path[2] === 'movement') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const materialId = path[1]
      const { type, quantity, unit_cost, note } = body
      const qty = parseFloat(quantity) || 0
      const { data: mat } = await supabaseAdmin.from('materials').select('*').eq('id', materialId).eq('user_id', user.id).single()
      if (!mat) return handleCORS(NextResponse.json({ error: 'Material no encontrado' }, { status: 404 }))
      let newStock = parseFloat(mat.stock_quantity) || 0
      if (type === 'purchase') newStock += qty
      else if (type === 'usage') newStock = Math.max(0, newStock - qty)
      else if (type === 'adjust') newStock = qty
      const upd = { stock_quantity: newStock }
      if (type === 'purchase' && unit_cost) upd.unit_cost = parseFloat(unit_cost)
      await supabaseAdmin.from('materials').update(upd).eq('id', materialId)
      await supabaseAdmin.from('material_movements').insert({
        user_id: user.id, material_id: materialId, type: type || 'adjust',
        quantity: qty, unit_cost: parseFloat(unit_cost) || 0, note: note || null
      })
      const { data: updated } = await supabaseAdmin.from('materials').select('*').eq('id', materialId).single()
      return handleCORS(NextResponse.json(updated))
    }

    if (pathStr === 'admin/users/set-password') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      const { userId, password } = body
      if (!userId || !password || password.length < 6) {
        return handleCORS(NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 }))
      }
      // Update the auth password via admin API
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
      if (authErr) return handleCORS(NextResponse.json({ error: authErr.message }, { status: 400 }))
      // Store the plaintext copy so it can be shown in the panel
      try { await supabaseAdmin.from('profiles').update({ plain_password: password }).eq('id', userId) } catch (e) {}
      return handleCORS(NextResponse.json({ success: true }))
    }

    if (pathStr === 'admin/users/update') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { userId, ...updates } = body
      
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Send message
    if (pathStr === 'admin/messages') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { data, error } = await supabaseAdmin
        .from('support_messages')
        .insert(body)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Update message
    if (pathStr.startsWith('admin/messages/') && path.length === 3) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const messageId = path[2]
      const { data, error } = await supabaseAdmin
        .from('support_messages')
        .update(body)
        .eq('id', messageId)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Assign plan
    if (pathStr === 'admin/assign-plan') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { userId, planId, autoRenew } = body
      
      // Get plan details
      const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single()
      if (!plan) return handleCORS(NextResponse.json({ error: 'Plan not found' }, { status: 404 }))
      
      // Deactivate current plan
      await supabase.from('user_plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true)
      
      // Calculate end date
      const startDate = new Date()
      const endDate = new Date(startDate.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)
      
      const { data, error } = await supabase
        .from('user_plans')
        .insert({
          user_id: userId,
          plan_id: planId,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: autoRenew || false
        })
        .select('*, plans(*)')
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Update plan
    if (pathStr === 'admin/plans/update') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { id, name, duration_days, price, is_active } = body
      
      const { data, error } = await supabaseAdmin
        .from('plans')
        .update({ name, duration_days, price, is_active })
        .eq('id', id)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Update info content
    if (pathStr === 'admin/info-content') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const { data, error } = await supabaseAdmin
        .from('info_content')
        .upsert(body)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Admin: Save global settings (for login page branding)
    if (pathStr === 'admin/global-settings') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      // First try to find existing record
      const { data: existing } = await supabaseAdmin
        .from('info_content')
        .select('id')
        .eq('title', 'GLOBAL_SOFTWARE_SETTINGS')
        .single()
      
      const settingsData = {
        title: 'GLOBAL_SOFTWARE_SETTINGS',
        link_url: body.logo_url || '',
        description: JSON.stringify(body),
        is_active: true
      }
      
      let result
      if (existing) {
        // Update existing
        result = await supabaseAdmin
          .from('info_content')
          .update(settingsData)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        // Insert new
        result = await supabaseAdmin
          .from('info_content')
          .insert(settingsData)
          .select()
          .single()
      }
      
      if (result.error) {
        console.error('Global settings save error:', result.error)
        return handleCORS(NextResponse.json({ success: true, localStorage: true }))
      }
      return handleCORS(NextResponse.json(result.data))
    }

    return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function PUT(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer(request.headers.get('Authorization'))
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const body = await request.json()

    // Booking module dispatcher (authenticated booking routes)
    const bookingRes = await handleBookingRoute({ method: 'PUT', supabase, supabaseAdmin, path, pathStr, body, searchParams: new URL(request.url).searchParams })
    if (bookingRes) return handleCORS(bookingRes)

    // Diagnostics module dispatcher (Fichas capilares)
    const diagRes = await handleDiagnosticsRoute({ method: 'PUT', supabase, supabaseAdmin, path, pathStr, body, searchParams: new URL(request.url).searchParams, authHeader: request.headers.get('Authorization') })
    if (diagRes) return handleCORS(diagRes)
    
    // Try to get user from cookies first
    let user = null
    const { data: cookieAuth } = await supabase.auth.getUser()
    user = cookieAuth?.user
    
    // If no user from cookies, try Authorization header
    if (!user) {
      const authHeader = request.headers.get('Authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        const { data: tokenAuth } = await supabaseAdmin.auth.getUser(token)
        user = tokenAuth?.user
      }
    }
    
    console.log('PUT request - path:', pathStr, 'user:', user?.id)
    
    if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    // Update profile
    if (pathStr === 'profile') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(body)
        .eq('id', user.id)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Update category
    if (pathStr.startsWith('categories/')) {
      const id = path[1]
      const { data, error } = await supabaseAdmin
        .from('categories')
        .update(body)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Update product
    if (pathStr.startsWith('products/')) {
      const id = path[1]
      // Whitelist fields only (supports partial updates like { stock_quantity })
      const productData = pickProductFields(body)
      const SELECT_COLS = 'id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,createdAt,categories(name)'
      const SELECT_COLS_FULL = 'id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,cost_price,is_combo,createdAt,categories(name)'

      let { data, error } = await supabaseAdmin
        .from('products')
        .update(productData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select(SELECT_COLS_FULL)
        .single()

      // Fallback if new columns (cost_price/is_combo) don't exist yet
      if (error) {
        const { cost_price, is_combo, ...safe } = productData
        if (Object.keys(safe).length > 0) {
          ;({ data, error } = await supabaseAdmin.from('products').update(safe).eq('id', id).eq('user_id', user.id).select(SELECT_COLS).single())
        }
      }
      if (error) {
        console.error('Product update error:', error)
        return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      }

      // Save combo components if provided
      if (Array.isArray(body.combo_items)) {
        await saveComboItems(supabaseAdmin, id, user.id, body.combo_items)
      }
      return handleCORS(NextResponse.json(data))
    }

    // Update checkout field - use admin client
    if (pathStr.startsWith('checkout-fields/')) {
      const id = path[1]
      const { data, error } = await supabaseAdmin
        .from('checkout_fields')
        .update(body)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Update material
    if (pathStr.startsWith('materials/') && path.length === 2) {
      const id = path[1]
      const upd = {}
      ;['name', 'unit'].forEach(f => { if (body[f] !== undefined) upd[f] = body[f] })
      if (body.stock_quantity !== undefined) upd.stock_quantity = parseFloat(body.stock_quantity) || 0
      if (body.unit_cost !== undefined) upd.unit_cost = parseFloat(body.unit_cost) || 0
      const { data, error } = await supabaseAdmin.from('materials').update(upd).eq('id', id).eq('user_id', user.id).select().single()
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json(data))
    }

    // Update order status / payment (seña) - use admin client
    if (pathStr.startsWith('orders/')) {
      const id = path[1]

      // Only update whitelisted fields
      const updateData = {}
      if (body.status) updateData.status = body.status
      if (body.deposit !== undefined) updateData.deposit = parseFloat(body.deposit) || 0
      if (body.discount !== undefined) updateData.discount = parseFloat(body.discount) || 0
      if (body.total !== undefined) updateData.total = parseFloat(body.total) || 0

      // Business rule: delivered = fully paid (no balance)
      if (body.status === 'delivered') {
        updateData.balance_due = 0
        updateData.payment_status = 'paid'
      } else if (body.deposit !== undefined || body.total !== undefined) {
        // recompute balance from current order if partial
        const { data: cur } = await supabaseAdmin.from('orders').select('total, deposit').eq('id', id).single()
        const t = updateData.total !== undefined ? updateData.total : (parseFloat(cur?.total) || 0)
        const dep = updateData.deposit !== undefined ? updateData.deposit : (parseFloat(cur?.deposit) || 0)
        updateData.balance_due = Math.max(0, t - dep)
        updateData.payment_status = dep > 0 ? 'partial' : 'pending'
      }

      let { data, error } = await supabaseAdmin.from('orders').update(updateData).eq('id', id).eq('user_id', user.id).select().single()
      // Fallback if seña columns don't exist yet
      if (error) {
        const minimal = {}
        if (updateData.status) minimal.status = updateData.status
        if (updateData.total !== undefined) minimal.total = updateData.total
        ;({ data, error } = await supabaseAdmin.from('orders').update(minimal).eq('id', id).eq('user_id', user.id).select().single())
      }
      if (error) {
        console.error('Order update error:', error)
        return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      }
      return handleCORS(NextResponse.json(data))
    }

    return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function DELETE(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer(request.headers.get('Authorization'))
  const supabaseAdmin = createSupabaseAdmin()

  try {
    // Booking module dispatcher (authenticated booking routes)
    const bookingRes = await handleBookingRoute({ method: 'DELETE', supabase, supabaseAdmin, path, pathStr, searchParams: new URL(request.url).searchParams })
    if (bookingRes) return handleCORS(bookingRes)

    // Diagnostics module dispatcher (Fichas capilares) — supports body for revoke
    let delBody = {}
    try { delBody = await request.clone().json() } catch { delBody = {} }
    const diagRes = await handleDiagnosticsRoute({ method: 'DELETE', supabase, supabaseAdmin, path, pathStr, body: delBody, searchParams: new URL(request.url).searchParams, authHeader: request.headers.get('Authorization') })
    if (diagRes) return handleCORS(diagRes)

    // Try to get user from cookies first
    let user = null
    const { data: cookieAuth } = await supabase.auth.getUser()
    user = cookieAuth?.user
    
    // If no user from cookies, try Authorization header
    if (!user) {
      const authHeader = request.headers.get('Authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        const { data: tokenAuth } = await supabaseAdmin.auth.getUser(token)
        user = tokenAuth?.user
      }
    }
    
    if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    // Delete category - use admin client
    if (pathStr.startsWith('categories/')) {
      const id = path[1]
      const { error } = await supabaseAdmin
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete product - use admin client
    if (pathStr.startsWith('products/')) {
      const id = path[1]
      const { error } = await supabaseAdmin
        .from('products')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete checkout field - use admin client
    if (pathStr.startsWith('checkout-fields/')) {
      const id = path[1]
      const { error } = await supabaseAdmin
        .from('checkout_fields')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete material - use admin client
    if (pathStr.startsWith('materials/')) {
      const id = path[1]
      await supabaseAdmin.from('material_movements').delete().eq('material_id', id)
      const { error } = await supabaseAdmin.from('materials').delete().eq('id', id).eq('user_id', user.id)
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete order - use admin client
    if (pathStr.startsWith('orders/')) {
      const id = path[1]
      // First delete order items
      await supabaseAdmin
        .from('order_items')
        .delete()
        .eq('order_id', id)
      
      // Then delete the order
      const { error } = await supabaseAdmin
        .from('orders')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete support message - use admin client
    if (pathStr.startsWith('admin/messages/')) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const messageId = path[2]
      const { error } = await supabaseAdmin
        .from('support_messages')
        .delete()
        .eq('id', messageId)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Delete info content - use admin client
    if (pathStr.startsWith('admin/info-content/')) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const contentId = path[2]
      const { error } = await supabaseAdmin
        .from('info_content')
        .delete()
        .eq('id', contentId)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Admin: Delete user - use admin client
    if (pathStr.startsWith('admin/users/')) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'DESARROLLADOR') {
        return handleCORS(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
      
      const userId = path[2]
      const { error } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId)
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
      return handleCORS(NextResponse.json({ success: true }))
    }

    return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}


// PATCH — used by the diagnostics module (client updates)
export async function PATCH(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer(request.headers.get('Authorization'))
  const supabaseAdmin = createSupabaseAdmin()
  let body = {}
  try { body = await request.json() } catch { body = {} }

  try {
    const diagRes = await handleDiagnosticsRoute({ method: 'PATCH', supabase, supabaseAdmin, path, pathStr, body, searchParams: new URL(request.url).searchParams, authHeader: request.headers.get('Authorization') })
    if (diagRes) return handleCORS(diagRes)
    return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}
