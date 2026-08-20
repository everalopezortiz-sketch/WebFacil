import { NextResponse } from 'next/server'
import { translateBookingError } from './errors'
import { BOOKING_DEFAULT_SETTINGS } from '../business'

const json = (data, status = 200) => NextResponse.json(data, { status })
const err = (message, status = 400) => NextResponse.json({ error: message }, { status })
// Private (never cache) response for appointment/customer data
const jsonPrivate = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v)

// ---- Allowed fields (never trust user_id/timestamps from client) ----
const CATEGORY_FIELDS = ['name', 'description', 'color', 'display_order', 'is_active']
const SERVICE_FIELDS = ['category_id', 'name', 'description', 'image_url', 'price', 'promo_price', 'promo_active', 'duration_minutes', 'buffer_before_minutes', 'buffer_after_minutes', 'color', 'display_order', 'is_active']
const STAFF_FIELDS = ['name', 'description', 'phone', 'email', 'photo_url', 'color', 'display_order', 'is_active', 'job_title', 'is_bookable', 'employment_started_on', 'compensation_type', 'pay_frequency', 'salary_amount', 'default_commission_percent', 'pay_weekday', 'pay_month_day', 'employment_notes']
const STAFF_SELECT = 'id,name,description,phone,email,photo_url,color,display_order,is_active,job_title,is_bookable,employment_started_on,compensation_type,pay_frequency,salary_amount,default_commission_percent,pay_weekday,pay_month_day,employment_notes,created_at,updated_at'
const COMP_TYPES = ['commission', 'salary', 'mixed']
const PAY_FREQS = ['weekly', 'monthly']
const PAY_METHODS = ['cash', 'transfer', 'card', 'mixed', 'other']
const ADVANCE_METHODS = ['cash', 'transfer', 'card', 'other']
const AVAILABILITY_FIELDS = ['staff_id', 'day_of_week', 'start_time', 'end_time', 'is_active']
const TIMEOFF_FIELDS = ['staff_id', 'starts_at', 'ends_at', 'reason']
const SETTINGS_FIELDS = ['timezone', 'slot_interval_minutes', 'min_booking_notice_minutes', 'max_advance_days', 'auto_confirm', 'allow_staff_choice', 'allow_multiple_services', 'require_phone', 'whatsapp_notifications', 'booking_instructions', 'cancellation_policy', 'week_starts_on']

// Public column selects
const SERVICE_PUBLIC = 'id,category_id,name,description,image_url,price,promo_price,promo_active,duration_minutes,buffer_before_minutes,buffer_after_minutes,color,display_order,is_active'
const STAFF_PUBLIC = 'id,name,description,photo_url,color,display_order,is_active'
const CATEGORY_PUBLIC = 'id,name,description,color,display_order,is_active'

function pick(body, fields) {
  const out = {}
  fields.forEach(f => { if (body[f] !== undefined) out[f] = body[f] })
  return out
}

// Validate & normalize a staff row payload. Returns { error } or { row }.
function buildStaffRow(body) {
  const row = pick(body, STAFF_FIELDS)
  const name = (row.name || '').toString().trim()
  if (!name) return { error: 'El nombre es obligatorio' }
  if (name.length > 160) return { error: 'El nombre es demasiado largo (máx. 160)' }
  row.name = name
  if (row.compensation_type && !COMP_TYPES.includes(row.compensation_type)) return { error: 'Tipo de remuneración inválido' }
  if (row.pay_frequency && !PAY_FREQS.includes(row.pay_frequency)) return { error: 'Frecuencia de pago inválida' }
  const numOrNull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v)
  if (row.salary_amount !== undefined) {
    const s = numOrNull(row.salary_amount)
    if (s !== null && (isNaN(s) || s < 0)) return { error: 'El sueldo debe ser mayor o igual a cero' }
    row.salary_amount = s
  }
  if (row.default_commission_percent !== undefined) {
    const p = numOrNull(row.default_commission_percent)
    if (p !== null && (isNaN(p) || p < 0 || p > 100)) return { error: 'El porcentaje debe estar entre 0 y 100' }
    row.default_commission_percent = p
  }
  if (row.pay_weekday !== undefined) {
    const w = numOrNull(row.pay_weekday)
    row.pay_weekday = (w === null || isNaN(w)) ? null : Math.min(7, Math.max(1, Math.round(w)))
  }
  if (row.pay_month_day !== undefined) {
    const d = numOrNull(row.pay_month_day)
    row.pay_month_day = (d === null || isNaN(d)) ? null : Math.min(28, Math.max(1, Math.round(d)))
  }
  if (row.employment_started_on === '') row.employment_started_on = null
  return { row }
}

// Accept either service_assignments [{service_id, commission_percent}] or legacy service_ids [].
function extractAssignments(body) {
  if (Array.isArray(body.service_assignments)) return body.service_assignments
  if (Array.isArray(body.service_ids)) return body.service_ids.map(id => ({ service_id: id, commission_percent: null }))
  return null
}

async function getUser(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Resolve a booking-enabled business by public slug. Returns profile or null.
async function resolveBookingBusiness(supabaseAdmin, slug) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id,first_name,last_name,business_type,slug,is_active,maintenance_mode')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  if (!profile) return null
  if (profile.business_type !== 'booking') return null
  return profile
}

/**
 * Main booking dispatcher. Returns a NextResponse when the path is a booking
 * route, otherwise returns null so the main catch-all continues.
 * ctx: { method, supabase, supabaseAdmin, path, pathStr, body, searchParams }
 */
export async function handleBookingRoute(ctx) {
  const { method, supabase, supabaseAdmin, path, pathStr, body = {}, searchParams } = ctx

  const isBooking = pathStr.startsWith('booking/') || pathStr === 'booking'
  const isPublicBooking = path[0] === 'store' && path[2] === 'booking'
  if (!isBooking && !isPublicBooking) return null

  try {
    // ============ PUBLIC BOOKING ROUTES ============
    if (isPublicBooking) {
      return await handlePublicBooking(ctx)
    }

    // ============ AUTHENTICATED BOOKING ROUTES ============
    const user = await getUser(supabase)
    if (!user) return err('Unauthorized', 401)
    const uid = user.id
    const sub = path[1] // e.g. 'services', 'staff', ...
    const id = path[2]  // resource id when present
    const action = path[2] // for appointments actions

    // ---- SERVICE CATEGORIES ----
    if (sub === 'service-categories') {
      if (method === 'GET') {
        const { data } = await supabaseAdmin.from('service_categories').select('*').eq('user_id', uid).order('display_order', { ascending: true })
        return json(data || [])
      }
      if (method === 'POST') {
        const row = { ...pick(body, CATEGORY_FIELDS), user_id: uid }
        if (!row.name) return err('El nombre es obligatorio')
        const { data, error } = await supabaseAdmin.from('service_categories').insert(row).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'PUT') {
        const { data, error } = await supabaseAdmin.from('service_categories').update(pick(body, CATEGORY_FIELDS)).eq('id', id).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'DELETE') {
        await supabaseAdmin.from('service_categories').delete().eq('id', id).eq('user_id', uid)
        return json({ success: true })
      }
    }

    // ---- SERVICES ----
    if (sub === 'services') {
      if (method === 'GET') {
        const { data } = await supabaseAdmin.from('booking_services').select('*').eq('user_id', uid).order('display_order', { ascending: true })
        return json(data || [])
      }
      if (method === 'POST') {
        const row = { ...pick(body, SERVICE_FIELDS), user_id: uid }
        if (!row.name) return err('El nombre es obligatorio')
        if (row.category_id === 'none' || row.category_id === '') row.category_id = null
        const { data, error } = await supabaseAdmin.from('booking_services').insert(row).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'PUT') {
        const upd = pick(body, SERVICE_FIELDS)
        if (upd.category_id === 'none' || upd.category_id === '') upd.category_id = null
        const { data, error } = await supabaseAdmin.from('booking_services').update(upd).eq('id', id).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'DELETE') {
        // Soft delete if the service was already used in an appointment (preserve history)
        const { count } = await supabaseAdmin.from('appointment_services').select('*', { count: 'exact', head: true }).eq('service_id', id).eq('user_id', uid)
        if (count && count > 0) {
          await supabaseAdmin.from('booking_services').update({ is_active: false }).eq('id', id).eq('user_id', uid)
          return json({ success: true, softDeleted: true })
        }
        await supabaseAdmin.from('booking_services').delete().eq('id', id).eq('user_id', uid)
        return json({ success: true })
      }
    }

    // ---- STAFF ----
    if (sub === 'staff') {
      if (method === 'GET') {
        const { data } = await supabaseAdmin.from('booking_staff').select(STAFF_SELECT).eq('user_id', uid).order('display_order', { ascending: true })
        return json(data || [])
      }
      if (method === 'POST') {
        const { row, error: vErr } = buildStaffRow(body)
        if (vErr) return err(vErr)
        row.user_id = uid
        const { data, error } = await supabaseAdmin.from('booking_staff').insert(row).select(STAFF_SELECT).single()
        if (error) return err(error.message)
        const assignments = extractAssignments(body)
        if (assignments) {
          const aErr = await setStaffServices(supabaseAdmin, uid, data.id, assignments)
          if (aErr) return err(aErr)
        }
        return json(data)
      }
      if (method === 'PUT') {
        const { row, error: vErr } = buildStaffRow(body)
        if (vErr) return err(vErr)
        const { data, error } = await supabaseAdmin.from('booking_staff').update(row).eq('id', id).eq('user_id', uid).select(STAFF_SELECT).single()
        if (error) return err(error.message)
        const assignments = extractAssignments(body)
        if (assignments) {
          const aErr = await setStaffServices(supabaseAdmin, uid, id, assignments)
          if (aErr) return err(aErr)
        }
        return json(data)
      }
      if (method === 'DELETE') {
        // Never hard-delete a professional with history: appointments, sales, advances or settlements.
        const [apptR, saleR, advR, setR] = await Promise.all([
          supabaseAdmin.from('appointments').select('*', { count: 'exact', head: true }).eq('staff_id', id).eq('user_id', uid),
          supabaseAdmin.from('booking_service_sale_items').select('*', { count: 'exact', head: true }).eq('staff_id', id).eq('user_id', uid),
          supabaseAdmin.from('booking_staff_advances').select('*', { count: 'exact', head: true }).eq('staff_id', id).eq('user_id', uid),
          supabaseAdmin.from('booking_staff_settlements').select('*', { count: 'exact', head: true }).eq('staff_id', id).eq('user_id', uid),
        ])
        const hasHistory = (apptR.count || 0) + (saleR.count || 0) + (advR.count || 0) + (setR.count || 0) > 0
        if (hasHistory) {
          await supabaseAdmin.from('booking_staff').update({ is_active: false }).eq('id', id).eq('user_id', uid)
          return json({ success: true, softDeleted: true })
        }
        await supabaseAdmin.from('booking_staff').delete().eq('id', id).eq('user_id', uid)
        return json({ success: true })
      }
    }

    // ---- STAFF-SERVICES ----
    if (sub === 'staff-services') {
      if (method === 'GET') {
        const staffId = searchParams.get('staff_id')
        let q = supabaseAdmin.from('booking_staff_services').select('staff_id,service_id,commission_percent,updated_at').eq('user_id', uid)
        if (staffId) q = q.eq('staff_id', staffId)
        const { data } = await q
        return json(data || [])
      }
      if (method === 'POST') {
        const staff_id = body.staff_id
        if (!isUuid(staff_id)) return err('Falta el profesional')
        const assignments = extractAssignments(body) || []
        const aErr = await setStaffServices(supabaseAdmin, uid, staff_id, assignments)
        if (aErr) return err(aErr)
        return json({ success: true })
      }
      if (method === 'DELETE') {
        const staffId = searchParams.get('staff_id')
        const serviceId = searchParams.get('service_id')
        let q = supabaseAdmin.from('booking_staff_services').delete().eq('user_id', uid)
        if (staffId) q = q.eq('staff_id', staffId)
        if (serviceId) q = q.eq('service_id', serviceId)
        await q
        return json({ success: true })
      }
    }

    // ---- AVAILABILITY (weekly schedule) ----
    if (sub === 'availability') {
      if (method === 'GET') {
        const staffId = searchParams.get('staff_id')
        let q = supabaseAdmin.from('booking_availability').select('*').eq('user_id', uid)
        if (staffId) q = q.eq('staff_id', staffId)
        const { data } = await q.order('day_of_week', { ascending: true }).order('start_time', { ascending: true })
        return json(data || [])
      }
      if (method === 'POST') {
        const row = { ...pick(body, AVAILABILITY_FIELDS), user_id: uid }
        if (!row.staff_id) return err('Falta el profesional')
        if (row.is_active === undefined) row.is_active = true
        const { data, error } = await supabaseAdmin.from('booking_availability').insert(row).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'PUT') {
        const { data, error } = await supabaseAdmin.from('booking_availability').update(pick(body, AVAILABILITY_FIELDS)).eq('id', id).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'DELETE') {
        await supabaseAdmin.from('booking_availability').delete().eq('id', id).eq('user_id', uid)
        return json({ success: true })
      }
    }

    // ---- TIME OFF (blocks / holidays / vacations) ----
    if (sub === 'time-off') {
      if (method === 'GET') {
        const { data } = await supabaseAdmin.from('booking_time_off').select('*').eq('user_id', uid).order('starts_at', { ascending: false })
        return json(data || [])
      }
      if (method === 'POST') {
        const row = { ...pick(body, TIMEOFF_FIELDS), user_id: uid }
        if (row.staff_id === 'all' || row.staff_id === '') row.staff_id = null
        if (!row.starts_at || !row.ends_at) return err('Faltan las fechas del bloqueo')
        const { data, error } = await supabaseAdmin.from('booking_time_off').insert(row).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'PUT') {
        const upd = pick(body, TIMEOFF_FIELDS)
        if (upd.staff_id === 'all' || upd.staff_id === '') upd.staff_id = null
        const { data, error } = await supabaseAdmin.from('booking_time_off').update(upd).eq('id', id).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        return json(data)
      }
      if (method === 'DELETE') {
        await supabaseAdmin.from('booking_time_off').delete().eq('id', id).eq('user_id', uid)
        return json({ success: true })
      }
    }

    // ---- SETTINGS ----
    if (sub === 'settings') {
      if (method === 'GET') {
        let { data } = await supabaseAdmin.from('booking_settings').select('*').eq('user_id', uid).single()
        if (!data) {
          const seed = { ...BOOKING_DEFAULT_SETTINGS, user_id: uid }
          const { data: created } = await supabaseAdmin.from('booking_settings').insert(seed).select().single()
          data = created || seed
        }
        return json(data)
      }
      if (method === 'PUT') {
        const upd = pick(body, SETTINGS_FIELDS)
        const { data, error } = await supabaseAdmin.from('booking_settings').update(upd).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        return json(data)
      }
    }

    // ---- APPOINTMENTS ----
    if (sub === 'appointments') {
      // /booking/appointments/manual | /reschedule | /status
      if (method === 'POST' && action === 'manual') {
        return await createAppointment(supabaseAdmin, uid, body, 'admin', uid)
      }
      if (method === 'PUT' && action === 'reschedule') {
        const { appointment_id, staff_id, start_at } = body
        const { data, error } = await supabaseAdmin.rpc('reschedule_booking_appointment', {
          p_user_id: uid, p_appointment_id: appointment_id, p_staff_id: staff_id, p_start_at: start_at
        })
        if (error) { const t = translateBookingError(error); return err(t.message) }
        return json(data || { success: true })
      }
      if (method === 'PUT' && action === 'status') {
        const { appointment_id, status, reason } = body
        const { data, error } = await supabaseAdmin.rpc('update_booking_appointment_status', {
          p_user_id: uid, p_appointment_id: appointment_id, p_status: status, p_reason: reason || null
        })
        if (error) { const t = translateBookingError(error); return err(t.message) }
        return json(data || { success: true })
      }
      if (method === 'GET') {
        const start = searchParams.get('start')
        const end = searchParams.get('end')
        const staffId = searchParams.get('staff_id')
        let q = supabaseAdmin.from('appointments').select('*, appointment_services(*)').eq('user_id', uid)
        if (start) q = q.gte('start_at', start)
        if (end) q = q.lte('start_at', end)
        if (staffId && staffId !== 'all') q = q.eq('staff_id', staffId)
        const { data } = await q.order('start_at', { ascending: true })
        return json(data || [])
      }
    }

    // ============ FINANCE MODULE (booking accounts only) ============
    const FINANCE_SUBS = ['checkouts', 'service-sales', 'staff-earnings', 'staff-advances', 'staff-settlements', 'finance']
    if (FINANCE_SUBS.includes(sub)) {
      const okBiz = await requireBookingProfile(supabaseAdmin, uid)
      if (!okBiz) return err('Esta cuenta no tiene agendamientos habilitados.', 403)
      const res = await handleBookingFinance({ method, supabaseAdmin, uid, path, sub, id, body, searchParams })
      if (res) return res
    }

    return err('Ruta de agenda no encontrada', 404)
  } catch (e) {
    console.error('booking route error:', e?.message)
    const t = translateBookingError(e)
    return err(t.message, 400)
  }
}

// Verify the authenticated user runs a booking business.
async function requireBookingProfile(supabaseAdmin, uid) {
  const { data } = await supabaseAdmin.from('profiles').select('business_type').eq('id', uid).single()
  return data?.business_type === 'booking'
}

const financeErr = (msg = 'No se pudo completar la operación. Verificá los datos e intentá nuevamente.', status = 400) =>
  NextResponse.json({ error: msg }, { status, headers: { 'Cache-Control': 'private, no-store' } })

// ============ BOOKING FINANCE HANDLERS ============
async function handleBookingFinance(ctx) {
  const { method, supabaseAdmin, uid, path, sub, id, body = {}, searchParams } = ctx
  const seg3 = path[3] // e.g. 'pay' in service-sales/{id}/pay
  const clampLimit = (v, def = 50, max = 100) => Math.min(max, Math.max(1, parseInt(v || def) || def))
  const clampOffset = (v) => Math.max(0, parseInt(v || '0') || 0)
  const nowIso = () => new Date().toISOString()

  // ---- GET /booking/checkouts/pending ----
  if (sub === 'checkouts' && id === 'pending' && method === 'GET') {
    const limit = clampLimit(searchParams.get('limit'))
    const offset = clampOffset(searchParams.get('offset'))
    const { data, error } = await supabaseAdmin.rpc('get_booking_pending_checkout_cards', { p_user_id: uid, p_limit: limit, p_offset: offset })
    if (error) { console.error('pending checkouts error:', error?.message); return financeErr() }
    return jsonPrivate(data || { items: [], limit, offset })
  }

  // ---- SERVICE SALES ----
  if (sub === 'service-sales') {
    // PUT /booking/service-sales/{id}/pay
    if (method === 'PUT' && seg3 === 'pay') {
      if (!isUuid(id)) return financeErr('Venta inválida')
      const pm = body.payment_method
      if (!PAY_METHODS.includes(pm)) return financeErr('Forma de pago inválida')
      const { data, error } = await supabaseAdmin.rpc('mark_booking_service_sale_paid', {
        p_user_id: uid, p_sale_id: id, p_payment_method: pm, p_paid_at: body.paid_at || nowIso(),
      })
      if (error) { console.error('mark paid error:', error?.message); return financeErr('No se pudo registrar el cobro.') }
      return jsonPrivate(data || { success: true })
    }
    // POST /booking/service-sales -> create sale (checkout or manual)
    if (method === 'POST') {
      const items = Array.isArray(body.items) ? body.items : []
      if (items.length < 1 || items.length > 50) return financeErr('Agregá entre 1 y 50 servicios.')
      for (const it of items) {
        if (!isUuid(it.service_id)) return financeErr('Servicio inválido en una línea.')
        if (!isUuid(it.staff_id)) return financeErr('Seleccioná el profesional en cada línea.')
      }
      const markPaid = !!body.mark_paid
      if (markPaid && !PAY_METHODS.includes(body.payment_method)) return financeErr('Seleccioná la forma de pago.')
      const p_items = items.map(it => ({
        service_id: it.service_id,
        appointment_service_id: isUuid(it.appointment_service_id) ? it.appointment_service_id : null,
        staff_id: it.staff_id,
        quantity: Math.max(1, parseInt(it.quantity) || 1),
        unit_price: Math.max(0, Number(it.unit_price) || 0),
        discount_amount: Math.max(0, Number(it.discount_amount) || 0),
      }))
      const { data, error } = await supabaseAdmin.rpc('create_booking_service_sale', {
        p_user_id: uid,
        p_items,
        p_appointment_id: isUuid(body.appointment_id) ? body.appointment_id : null,
        p_client_id: isUuid(body.client_id) ? body.client_id : null,
        p_customer_name: body.customer_name ? String(body.customer_name).slice(0, 160) : null,
        p_customer_phone: body.customer_phone ? String(body.customer_phone).slice(0, 40) : null,
        p_mark_paid: markPaid,
        p_payment_method: markPaid ? body.payment_method : null,
        p_completed_at: body.completed_at || nowIso(),
        p_notes: body.notes ? String(body.notes).slice(0, 500) : null,
      })
      if (error) { console.error('create sale error:', error?.message); const t = translateBookingError(error); return financeErr(t.code === 'BOOKING_ERROR' ? 'No se pudo registrar el servicio.' : t.message) }
      return jsonPrivate(data || { success: true })
    }
    // GET /booking/service-sales -> paginated history
    if (method === 'GET') {
      const from = searchParams.get('from')
      const to = searchParams.get('to')
      const staffId = searchParams.get('staff_id')
      const payStatus = searchParams.get('payment_status')
      const search = (searchParams.get('search') || '').trim()
      const limit = clampLimit(searchParams.get('limit'))
      const offset = clampOffset(searchParams.get('offset'))
      const itemsSel = (staffId && isUuid(staffId) ? 'booking_service_sale_items!inner' : 'booking_service_sale_items') +
        '(id,service_id,staff_id,service_name_snapshot,staff_name_snapshot,quantity,unit_price,discount_amount,net_amount,commission_percent,commission_amount)'
      let q = supabaseAdmin.from('booking_service_sales')
        .select(`id,sale_number,source,customer_name,customer_phone,subtotal,discount_amount,total_amount,status,payment_status,payment_method,completed_at,paid_at,notes,created_at,${itemsSel}`)
        .eq('user_id', uid).neq('status', 'voided')
      if (from) q = q.gte('completed_at', new Date(from + 'T00:00:00').toISOString())
      if (to) q = q.lte('completed_at', new Date(to + 'T23:59:59').toISOString())
      if (staffId && isUuid(staffId)) q = q.eq('booking_service_sale_items.staff_id', staffId)
      if (payStatus === 'paid' || payStatus === 'pending') q = q.eq('payment_status', payStatus)
      if (search) q = q.or(`customer_name.ilike.%${search}%,sale_number.ilike.%${search}%`)
      const { data, error } = await q.order('completed_at', { ascending: false }).range(offset, offset + limit - 1)
      if (error) { console.error('service-sales list error:', error?.message); return financeErr() }
      return jsonPrivate({ items: data || [], limit, offset })
    }
  }

  // ---- STAFF EARNINGS (service lines, marked pending/paid) ----
  if (sub === 'staff-earnings' && method === 'GET') {
    const staffId = searchParams.get('staff_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const status = searchParams.get('status') // pending | paid
    const limit = clampLimit(searchParams.get('limit'))
    const offset = clampOffset(searchParams.get('offset'))
    let q = supabaseAdmin.from('booking_service_sale_items')
      .select('id,sale_id,service_id,staff_id,service_name_snapshot,staff_name_snapshot,quantity,unit_price,discount_amount,net_amount,commission_percent,commission_amount,booking_service_sales!inner(sale_number,completed_at,customer_name,payment_status,status)')
      .eq('user_id', uid).eq('booking_service_sales.status', 'completed')
    if (staffId && isUuid(staffId)) q = q.eq('staff_id', staffId)
    if (from) q = q.gte('booking_service_sales.completed_at', new Date(from + 'T00:00:00').toISOString())
    if (to) q = q.lte('booking_service_sales.completed_at', new Date(to + 'T23:59:59').toISOString())
    const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    if (error) { console.error('staff-earnings error:', error?.message); return financeErr() }
    const rows = data || []
    const ids = rows.map(r => r.id)
    const paidSet = new Set()
    if (ids.length) {
      const { data: si } = await supabaseAdmin.from('booking_staff_settlement_items').select('sale_item_id').eq('user_id', uid).in('sale_item_id', ids)
      ;(si || []).forEach(x => paidSet.add(x.sale_item_id))
    }
    let items = rows.map(r => {
      const sale = r.booking_service_sales || {}
      return {
        id: r.id, sale_id: r.sale_id, service_id: r.service_id, staff_id: r.staff_id,
        service_name: r.service_name_snapshot, staff_name: r.staff_name_snapshot,
        quantity: r.quantity, unit_price: r.unit_price, discount_amount: r.discount_amount,
        net_amount: r.net_amount, commission_percent: r.commission_percent, commission_amount: r.commission_amount,
        sale_number: sale.sale_number, completed_at: sale.completed_at, customer_name: sale.customer_name,
        settlement_status: paidSet.has(r.id) ? 'paid' : 'pending',
      }
    })
    if (status === 'pending') items = items.filter(i => i.settlement_status === 'pending')
    else if (status === 'paid') items = items.filter(i => i.settlement_status === 'paid')
    return jsonPrivate({ items, limit, offset })
  }

  // ---- STAFF ADVANCES ----
  if (sub === 'staff-advances') {
    if (method === 'GET') {
      const staffId = searchParams.get('staff_id')
      const status = searchParams.get('status')
      let q = supabaseAdmin.from('booking_staff_advances')
        .select('id,staff_id,amount,applied_amount,advance_date,payment_method,status,notes,created_at')
        .eq('user_id', uid)
      if (staffId && isUuid(staffId)) q = q.eq('staff_id', staffId)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('advance_date', { ascending: false }).limit(200)
      if (error) { console.error('advances list error:', error?.message); return financeErr() }
      return jsonPrivate({ items: data || [] })
    }
    if (method === 'POST') {
      if (!isUuid(body.staff_id)) return financeErr('Seleccioná el profesional.')
      const amount = Number(body.amount)
      if (isNaN(amount) || amount <= 0) return financeErr('El monto debe ser mayor a cero.')
      if (body.payment_method && !ADVANCE_METHODS.includes(body.payment_method)) return financeErr('Forma de entrega inválida.')
      const { data, error } = await supabaseAdmin.rpc('create_booking_staff_advance', {
        p_user_id: uid, p_staff_id: body.staff_id, p_amount: amount,
        p_advance_date: body.advance_date || new Date().toISOString().slice(0, 10),
        p_payment_method: body.payment_method || 'cash',
        p_notes: body.notes ? String(body.notes).slice(0, 300) : null,
      })
      if (error) { console.error('create advance error:', error?.message); return financeErr('No se pudo registrar el adelanto.') }
      return jsonPrivate(data || { success: true })
    }
    if (method === 'PUT') {
      if (!isUuid(id)) return financeErr('Adelanto inválido')
      const { data: adv } = await supabaseAdmin.from('booking_staff_advances').select('applied_amount,status').eq('id', id).eq('user_id', uid).single()
      if (!adv) return financeErr('Adelanto no encontrado', 404)
      if (Number(adv.applied_amount) > 0 || adv.status !== 'pending') return financeErr('No se puede editar un adelanto ya aplicado.', 409)
      const upd = {}
      if (body.amount !== undefined) { const a = Number(body.amount); if (isNaN(a) || a <= 0) return financeErr('Monto inválido'); upd.amount = a }
      if (body.advance_date !== undefined) upd.advance_date = body.advance_date
      if (body.payment_method !== undefined) { if (body.payment_method && !ADVANCE_METHODS.includes(body.payment_method)) return financeErr('Forma de entrega inválida.'); upd.payment_method = body.payment_method }
      if (body.notes !== undefined) upd.notes = body.notes ? String(body.notes).slice(0, 300) : null
      const { data, error } = await supabaseAdmin.from('booking_staff_advances').update(upd).eq('id', id).eq('user_id', uid).select('id,staff_id,amount,applied_amount,advance_date,payment_method,status,notes,created_at').single()
      if (error) { console.error('advance update error:', error?.message); return financeErr() }
      return jsonPrivate(data)
    }
    if (method === 'DELETE') {
      if (!isUuid(id)) return financeErr('Adelanto inválido')
      const { data: adv } = await supabaseAdmin.from('booking_staff_advances').select('applied_amount,status').eq('id', id).eq('user_id', uid).single()
      if (!adv) return financeErr('Adelanto no encontrado', 404)
      if (Number(adv.applied_amount) > 0 || adv.status !== 'pending') return financeErr('No se puede eliminar un adelanto ya aplicado.', 409)
      await supabaseAdmin.from('booking_staff_advances').delete().eq('id', id).eq('user_id', uid)
      return jsonPrivate({ success: true })
    }
  }

  // ---- STAFF SETTLEMENTS ----
  if (sub === 'staff-settlements') {
    // GET detail: /booking/staff-settlements/{id}
    if (method === 'GET' && id && isUuid(id)) {
      const { data: settlement } = await supabaseAdmin.from('booking_staff_settlements')
        .select('id,staff_id,settlement_number,period_start,period_end,compensation_type_snapshot,pay_frequency_snapshot,base_salary_amount,commission_total,advances_total,net_paid,payment_method,paid_at,status,notes,created_at')
        .eq('id', id).eq('user_id', uid).single()
      if (!settlement) return financeErr('Liquidación no encontrada', 404)
      const { data: staff } = await supabaseAdmin.from('booking_staff').select('id,name,job_title,phone').eq('id', settlement.staff_id).eq('user_id', uid).single()
      const { data: itemRows } = await supabaseAdmin.from('booking_staff_settlement_items')
        .select('sale_item_id,commission_amount_snapshot').eq('settlement_id', id).eq('user_id', uid)
      const saleItemIds = (itemRows || []).map(r => r.sale_item_id)
      let lines = []
      if (saleItemIds.length) {
        const { data: sis } = await supabaseAdmin.from('booking_service_sale_items')
          .select('id,sale_id,service_name_snapshot,quantity,unit_price,discount_amount,net_amount,commission_percent,commission_amount')
          .eq('user_id', uid).in('id', saleItemIds)
        const saleIds = [...new Set((sis || []).map(s => s.sale_id))]
        const saleMap = {}
        if (saleIds.length) {
          const { data: sales } = await supabaseAdmin.from('booking_service_sales').select('id,sale_number,completed_at,customer_name').eq('user_id', uid).in('id', saleIds)
          ;(sales || []).forEach(s => { saleMap[s.id] = s })
        }
        const snapMap = {}
        ;(itemRows || []).forEach(r => { snapMap[r.sale_item_id] = r.commission_amount_snapshot })
        lines = (sis || []).map(s => {
          const sale = saleMap[s.sale_id] || {}
          return {
            service_name: s.service_name_snapshot, quantity: s.quantity, unit_price: s.unit_price,
            discount_amount: s.discount_amount, net_amount: s.net_amount,
            commission_percent: s.commission_percent, commission_amount: snapMap[s.id] ?? s.commission_amount,
            sale_number: sale.sale_number, completed_at: sale.completed_at, customer_name: sale.customer_name,
          }
        }).sort((a, b) => new Date(a.completed_at || 0) - new Date(b.completed_at || 0))
      }
      const { data: advRows } = await supabaseAdmin.from('booking_staff_settlement_advances')
        .select('advance_id,amount_applied').eq('settlement_id', id).eq('user_id', uid)
      let advances = []
      const advIds = (advRows || []).map(r => r.advance_id)
      if (advIds.length) {
        const { data: advs } = await supabaseAdmin.from('booking_staff_advances').select('id,advance_date,payment_method').eq('user_id', uid).in('id', advIds)
        const advMap = {}
        ;(advs || []).forEach(a => { advMap[a.id] = a })
        advances = (advRows || []).map(r => ({ amount_applied: r.amount_applied, advance_date: advMap[r.advance_id]?.advance_date, payment_method: advMap[r.advance_id]?.payment_method }))
      }
      return jsonPrivate({ settlement, staff: staff || null, lines, advances })
    }
    // GET list
    if (method === 'GET') {
      const staffId = searchParams.get('staff_id')
      const limit = clampLimit(searchParams.get('limit'))
      const offset = clampOffset(searchParams.get('offset'))
      let q = supabaseAdmin.from('booking_staff_settlements')
        .select('id,staff_id,settlement_number,period_start,period_end,compensation_type_snapshot,base_salary_amount,commission_total,advances_total,net_paid,payment_method,paid_at,status,created_at')
        .eq('user_id', uid)
      if (staffId && isUuid(staffId)) q = q.eq('staff_id', staffId)
      const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
      if (error) { console.error('settlements list error:', error?.message); return financeErr() }
      return jsonPrivate({ items: data || [], limit, offset })
    }
    // POST -> pay pending
    if (method === 'POST') {
      if (!isUuid(body.staff_id)) return financeErr('Seleccioná el profesional.')
      if (!body.period_start || !body.period_end) return financeErr('Indicá el período.')
      if (!PAY_METHODS.includes(body.payment_method)) return financeErr('Seleccioná la forma de pago.')
      const { data, error } = await supabaseAdmin.rpc('pay_booking_staff_pending', {
        p_user_id: uid, p_staff_id: body.staff_id,
        p_period_start: body.period_start, p_period_end: body.period_end,
        p_payment_method: body.payment_method, p_paid_at: body.paid_at || nowIso(),
        p_notes: body.notes ? String(body.notes).slice(0, 500) : null,
      })
      if (error) { console.error('pay pending error:', error?.message); return financeErr('No se pudo procesar el pago.') }
      return jsonPrivate(data || { success: true })
    }
  }

  // ---- FINANCE DASHBOARD / STAFF SUMMARY ----
  if (sub === 'finance' && method === 'GET') {
    const from = searchParams.get('from') || searchParams.get('date_from')
    const to = searchParams.get('to') || searchParams.get('date_to')
    if (!from || !to) return financeErr('Indicá el rango de fechas.')
    if (id === 'dashboard') {
      const { data, error } = await supabaseAdmin.rpc('get_booking_finance_dashboard', { p_user_id: uid, p_date_from: from, p_date_to: to })
      if (error) { console.error('finance dashboard error:', error?.message); return financeErr() }
      return jsonPrivate(data || {})
    }
    if (id === 'staff-summary') {
      const { data, error } = await supabaseAdmin.rpc('get_booking_staff_finance_summary', { p_user_id: uid, p_date_from: from, p_date_to: to })
      if (error) { console.error('finance staff-summary error:', error?.message); return financeErr() }
      return jsonPrivate(data || [])
    }
  }

  return null
}

// Sync a professional's service assignments (with per-service commission).
// assignments: [{ service_id, commission_percent }]. Preserves commissions,
// removes only unselected services, upserts the rest. Returns error string or null.
async function setStaffServices(supabaseAdmin, uid, staffId, assignments) {
  const clean = (assignments || []).filter(a => a && isUuid(a.service_id))
  if (clean.length > 100) return 'Máximo 100 servicios por profesional'
  const map = new Map()
  for (const a of clean) {
    let cp = a.commission_percent
    if (cp === '' || cp === undefined) cp = null
    if (cp !== null) {
      cp = Number(cp)
      if (isNaN(cp)) cp = null
      else cp = Math.min(100, Math.max(0, cp))
    }
    map.set(a.service_id, cp) // dedupe by service_id
  }
  let serviceIds = [...map.keys()]
  // Only keep services that belong to this user
  if (serviceIds.length) {
    const { data: owned } = await supabaseAdmin.from('booking_services').select('id').eq('user_id', uid).in('id', serviceIds)
    const ownedSet = new Set((owned || []).map(s => s.id))
    for (const sid of serviceIds) if (!ownedSet.has(sid)) map.delete(sid)
    serviceIds = [...map.keys()]
  }
  // Remove assignments no longer selected
  const { data: existing } = await supabaseAdmin.from('booking_staff_services').select('service_id').eq('user_id', uid).eq('staff_id', staffId)
  const toDelete = (existing || []).map(r => r.service_id).filter(sid => !map.has(sid))
  if (toDelete.length) await supabaseAdmin.from('booking_staff_services').delete().eq('user_id', uid).eq('staff_id', staffId).in('service_id', toDelete)
  // Upsert selected (conflict on staff_id,service_id)
  const rows = serviceIds.map(sid => ({ user_id: uid, staff_id: staffId, service_id: sid, commission_percent: map.get(sid) }))
  if (rows.length) {
    const { error } = await supabaseAdmin.from('booking_staff_services').upsert(rows, { onConflict: 'staff_id,service_id' })
    if (error) return 'No se pudieron guardar las asignaciones'
  }
  return null
}

// Returns { data, error } from the create RPC without wrapping in a response,
// so public callers can enrich the payload (e.g. with the public_token).
async function createAppointmentData(supabaseAdmin, businessUserId, body, source, createdBy) {
  const serviceIds = body.service_ids || body.serviceIds || []
  return await supabaseAdmin.rpc('create_booking_appointment', {
    p_user_id: businessUserId,
    p_staff_id: body.staff_id || body.staffId || null,
    p_service_ids: serviceIds,
    p_start_at: body.start_at || body.startAt,
    p_customer_name: body.customer_name || body.customerName,
    p_customer_phone: body.customer_phone || body.customerPhone,
    p_customer_email: body.customer_email || body.customerEmail || null,
    p_customer_notes: body.customer_notes || body.customerNotes || null,
    p_source: source,
    p_created_by: createdBy,
  })
}

async function createAppointment(supabaseAdmin, businessUserId, body, source, createdBy) {
  const { data, error } = await createAppointmentData(supabaseAdmin, businessUserId, body, source, createdBy)
  if (error) { const t = translateBookingError(error); return err(t.message) }
  return json(data || { success: true })
}

// ============ PUBLIC BOOKING HANDLERS ============
async function handlePublicBooking(ctx) {
  const { method, supabaseAdmin, path, body = {}, searchParams } = ctx
  const slug = path[1]
  const seg = path[3] // undefined | 'availability' | 'confirmation'

  const business = await resolveBookingBusiness(supabaseAdmin, slug)
  if (!business) return err('Este negocio no tiene habilitados los agendamientos.', 404)
  if (business.maintenance_mode) return err('Negocio en mantenimiento', 503)
  const bid = business.id

  // GET /store/{slug}/booking -> full public booking data
  if (method === 'GET' && !seg) {
    const [catsRes, svcRes, staffRes, ssRes, setRes] = await Promise.all([
      supabaseAdmin.from('service_categories').select(CATEGORY_PUBLIC).eq('user_id', bid).eq('is_active', true).order('display_order'),
      supabaseAdmin.from('booking_services').select(SERVICE_PUBLIC).eq('user_id', bid).eq('is_active', true).order('display_order'),
      supabaseAdmin.from('booking_staff').select(STAFF_PUBLIC).eq('user_id', bid).eq('is_active', true).eq('is_bookable', true).order('display_order'),
      supabaseAdmin.from('booking_staff_services').select('staff_id,service_id').eq('user_id', bid),
      supabaseAdmin.from('booking_settings').select('timezone,slot_interval_minutes,min_booking_notice_minutes,max_advance_days,auto_confirm,allow_staff_choice,allow_multiple_services,require_phone,booking_instructions,cancellation_policy,week_starts_on').eq('user_id', bid).single(),
    ])
    return json({
      business: { first_name: business.first_name, last_name: business.last_name, slug: business.slug },
      settings: setRes.data || BOOKING_DEFAULT_SETTINGS,
      serviceCategories: catsRes.data || [],
      services: svcRes.data || [],
      staff: staffRes.data || [],
      staffServices: ssRes.data || [],
    })
  }

  // GET /store/{slug}/booking/availability?staff_id=&service_ids=&date=
  if (method === 'GET' && seg === 'availability') {
    const staffId = searchParams.get('staff_id') || null
    const date = searchParams.get('date')
    const serviceIds = (searchParams.get('service_ids') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (serviceIds.length === 0) return err('Selecciona al menos un servicio.')
    if (!date) return err('Selecciona una fecha.')
    const { data, error } = await supabaseAdmin.rpc('get_booking_available_slots', {
      p_user_id: bid,
      p_staff_id: staffId && staffId !== 'any' ? staffId : null,
      p_service_ids: serviceIds,
      p_date: date,
    })
    if (error) { const t = translateBookingError(error); return err(t.message) }
    return NextResponse.json(data || [], { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  }

  // GET /store/{slug}/booking/confirmation?token= | ?code=
  if (method === 'GET' && seg === 'confirmation') {
    const token = searchParams.get('token')
    const code = searchParams.get('code')
    let q = supabaseAdmin.from('appointments')
      .select('confirmation_code,public_token,start_at,end_at,status,total_price,total_duration_minutes,staff_id,customer_name,appointment_services(service_name,price,duration_minutes,display_order)')
      .eq('user_id', bid)
    if (token) q = q.eq('public_token', token)
    else if (code) q = q.eq('confirmation_code', code)
    else return err('Falta el código de confirmación.')
    const { data } = await q.single()
    if (!data) return err('No se encontró la reserva.', 404)
    return json(data)
  }

  // POST /store/{slug}/booking -> create a public appointment (server-validated)
  if (method === 'POST' && !seg) {
    const { data, error } = await createAppointmentData(supabaseAdmin, bid, body, 'public', null)
    if (error) { const t = translateBookingError(error); return err(t.message) }
    // Ensure the caller receives the public_token so it can be stored on-device
    let publicToken = data?.publicToken || data?.public_token || null
    const confirmationCode = data?.confirmationCode || data?.confirmation_code || null
    const apptId = data?.appointmentId || data?.appointment_id || data?.id || null
    if (!publicToken && (apptId || confirmationCode)) {
      let q = supabaseAdmin.from('appointments').select('public_token').eq('user_id', bid)
      q = apptId && isUuid(apptId) ? q.eq('id', apptId) : q.eq('confirmation_code', confirmationCode)
      const { data: appt } = await q.maybeSingle()
      publicToken = appt?.public_token || null
    }
    return jsonPrivate({ ...(data || {}), publicToken, public_token: publicToken })
  }

  // POST /store/{slug}/booking/my-appointments -> batch lookup by device tokens
  if (method === 'POST' && seg === 'my-appointments') {
    const normDigits = (p) => (p || '').toString().replace(/\D/g, '')
    // Optional recovery by confirmation code + full phone (never code alone)
    if (body.recover && body.recover.code) {
      const code = String(body.recover.code).trim().toUpperCase()
      const phone = normDigits(body.recover.phone)
      if (!code || phone.length < 6) return err('Ingresá el código y el teléfono completo.')
      const { data: appt } = await supabaseAdmin.from('appointments')
        .select('public_token,customer_phone').eq('user_id', bid).eq('confirmation_code', code).maybeSingle()
      const dbPhone = normDigits(appt?.customer_phone)
      const phoneMatch = appt && dbPhone && (dbPhone === phone || dbPhone.endsWith(phone) || phone.endsWith(dbPhone))
      if (!appt || !phoneMatch) return err('No encontramos una cita con esos datos.', 404)
      return jsonPrivate({ public_token: appt.public_token })
    }
    const raw = Array.isArray(body.tokens) ? body.tokens : []
    const tokens = [...new Set(raw.filter(isUuid))].slice(0, 10)
    if (tokens.length === 0) return jsonPrivate({ appointments: [] })
    let rows = []
    try {
      const { data } = await supabaseAdmin.from('appointments')
        .select('public_token,status,confirmation_code,start_at,end_at,total_price,total_duration_minutes,staff_id,previous_start_at,previous_end_at,rescheduled_at,reschedule_count,appointment_services(service_name,display_order)')
        .eq('user_id', bid).in('public_token', tokens)
      rows = data || []
    } catch { rows = [] }
    // Resolve staff names (single query)
    const staffIds = [...new Set(rows.map(r => r.staff_id).filter(Boolean))]
    const staffMap = {}
    if (staffIds.length) {
      const { data: st } = await supabaseAdmin.from('booking_staff').select('id,name').eq('user_id', bid).in('id', staffIds)
      ;(st || []).forEach(s => { staffMap[s.id] = s.name })
    }
    const appointments = rows.map(r => ({
      public_token: r.public_token,
      status: r.status,
      confirmation_code: r.confirmation_code,
      start_at: r.start_at,
      end_at: r.end_at,
      total_price: r.total_price,
      total_duration_minutes: r.total_duration_minutes,
      staff_name: staffMap[r.staff_id] || null,
      services: (r.appointment_services || []).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)).map(s => s.service_name),
      previous_start_at: r.previous_start_at || null,
      previous_end_at: r.previous_end_at || null,
      rescheduled_at: r.rescheduled_at || null,
      reschedule_count: r.reschedule_count || 0,
    }))
    return jsonPrivate({ appointments })
  }

  return err('Ruta pública de agenda no encontrada', 404)
}
