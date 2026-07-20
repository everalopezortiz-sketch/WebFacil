import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'

// Create Supabase client for server-side operations (with user context)
function createSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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

// CORS headers
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

export async function GET(request, { params }) {
  const path = params?.path || []
  const pathStr = path.join('/')
  const supabase = createSupabaseServer()
  const supabaseAdmin = createSupabaseAdmin()
  const { searchParams } = new URL(request.url)

  try {
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
        .select('*, categories(name)')
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
          .select('*')
          .eq('title', 'GLOBAL_SOFTWARE_SETTINGS')
          .single()
        
        if (data && data.description) {
          try {
            const settings = JSON.parse(data.description)
            return handleCORS(NextResponse.json(settings))
          } catch (e) {
            return handleCORS(NextResponse.json({ name: 'webFácil' }))
          }
        }
      } catch (e) {
        console.log('Global settings not found')
      }
      return handleCORS(NextResponse.json({ name: 'webFácil' }))
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
      
      // Calculate top products
      const productSales = {}
      orders?.forEach(order => {
        order.order_items?.forEach(item => {
          if (!productSales[item.product_name]) {
            productSales[item.product_name] = { quantity: 0, revenue: 0 }
          }
          productSales[item.product_name].quantity += item.quantity
          productSales[item.product_name].revenue += parseFloat(item.subtotal)
        })
      })
      
      const topProducts = Object.entries(productSales)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
      
      const totalRevenue = orders?.reduce((sum, o) => sum + parseFloat(o.total), 0) || 0
      const totalOrders = orders?.length || 0
      
      return handleCORS(NextResponse.json({ orders, topProducts, totalRevenue, totalOrders }))
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
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()
      
      if (!profile) {
        return handleCORS(NextResponse.json({ error: 'Store not found' }, { status: 404 }))
      }
      
      if (profile.maintenance_mode) {
        return handleCORS(NextResponse.json({ error: 'Store in maintenance', maintenance: true }, { status: 503 }))
      }
      
      // Run all queries in parallel to reduce latency, plus non-blocking visit tracking
      const [settingsRes, categoriesRes, productsRes, checkoutRes] = await Promise.all([
        supabaseAdmin.from('user_settings').select('*').eq('user_id', profile.id).single(),
        supabaseAdmin.from('categories').select('*').eq('user_id', profile.id).eq('is_active', true).order('display_order'),
        supabaseAdmin.from('products').select('*, categories(name)').eq('user_id', profile.id).eq('is_active', true).order('createdAt', { ascending: false }),
        supabaseAdmin.from('checkout_fields').select('*').eq('user_id', profile.id).eq('is_active', true).order('display_order'),
        // fire-and-forget visit tracking (don't block response)
        supabaseAdmin.from('store_visits').insert({ user_id: profile.id }).then(() => {}, () => {})
      ])

      const settings = settingsRes?.data
      const categories = categoriesRes?.data
      const products = productsRes?.data
      const checkoutFields = checkoutRes?.data
      
      return handleCORS(NextResponse.json({
        profile,
        settings,
        categories,
        products,
        checkoutFields
      }))
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
  const supabase = createSupabaseServer()
  const supabaseAdmin = createSupabaseAdmin()

  try {
    let body = {}
    try {
      body = await request.json()
    } catch (e) {
      // Body might be empty for some requests like signout
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
      
      // Clean category_id if it's 'none'
      const productData = { ...body, user_id: user.id }
      if (productData.category_id === 'none' || productData.category_id === '') {
        productData.category_id = null
      }
      // Normalize stock_quantity: empty -> null (unlimited)
      if (productData.stock_quantity === '' || productData.stock_quantity === undefined) {
        productData.stock_quantity = null
      }
      
      const { data, error } = await supabaseAdmin
        .from('products')
        .insert(productData)
        .select()
        .single()
      
      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
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
      
      // Deduct stock for products that track inventory (stock_quantity not null)
      try {
        for (const item of items) {
          if (!item.productId) continue
          const { data: prod } = await supabaseAdmin
            .from('products')
            .select('stock_quantity')
            .eq('id', item.productId)
            .single()
          if (prod && prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
            const newStock = Math.max(0, prod.stock_quantity - (item.quantity || 0))
            await supabaseAdmin
              .from('products')
              .update({ stock_quantity: newStock })
              .eq('id', item.productId)
          }
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

      const { customerName, description, items, total, saleDate, deductStock } = body
      const orderNumber = `VTA-${Date.now().toString(36).toUpperCase()}`

      const insertData = {
        user_id: user.id,
        order_number: orderNumber,
        customer_name: customerName || 'Venta directa',
        status: 'delivered',
        total: parseFloat(total) || 0,
        notes: description || null
      }
      // Allow backdating the sale
      if (saleDate) {
        const d = new Date(saleDate)
        if (!isNaN(d.getTime())) insertData.createdAt = d.toISOString()
      }

      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .insert(insertData)
        .select()
        .single()

      if (error) return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))

      if (Array.isArray(items) && items.length > 0) {
        const orderItems = items.map(item => ({
          order_id: order.id,
          product_id: item.productId || null,
          product_name: item.productName,
          quantity: item.quantity || 1,
          unit_price: item.unitPrice || 0,
          subtotal: item.subtotal != null ? item.subtotal : (item.unitPrice || 0) * (item.quantity || 1)
        }))
        await supabaseAdmin.from('order_items').insert(orderItems)

        // Optionally deduct stock
        if (deductStock) {
          for (const item of items) {
            if (!item.productId) continue
            const { data: prod } = await supabaseAdmin.from('products').select('stock_quantity').eq('id', item.productId).single()
            if (prod && prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
              await supabaseAdmin.from('products').update({ stock_quantity: Math.max(0, prod.stock_quantity - (item.quantity || 0)) }).eq('id', item.productId)
            }
          }
        }
      }

      return handleCORS(NextResponse.json({ order, orderNumber }))
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
  const supabase = createSupabaseServer()
  const supabaseAdmin = createSupabaseAdmin()

  try {
    const body = await request.json()
    
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
      // Clean category_id if it's 'none' and remove JOIN properties
      const productData = { ...body }
      if (productData.category_id === 'none' || productData.category_id === '') {
        productData.category_id = null
      }
      // Remove properties that come from JOINs
      delete productData.categories
      delete productData.created_at
      delete productData.updated_at
      // Normalize stock_quantity: empty -> null (unlimited)
      if (productData.stock_quantity === '') {
        productData.stock_quantity = null
      }
      
      const { data, error } = await supabaseAdmin
        .from('products')
        .update(productData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      
      if (error) {
        console.error('Product update error:', error)
        return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
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

    // Update order status - use admin client
    if (pathStr.startsWith('orders/')) {
      const id = path[1]
      console.log('Updating order:', id, 'with body:', body)
      
      // Only update the status field
      const updateData = {}
      if (body.status) updateData.status = body.status
      
      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
      
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
  const supabase = createSupabaseServer()
  const supabaseAdmin = createSupabaseAdmin()

  try {
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
