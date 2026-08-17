import { NextResponse } from 'next/server'
import { translateBookingError } from './errors'
import { BOOKING_DEFAULT_SETTINGS } from '../business'

const json = (data, status = 200) => NextResponse.json(data, { status })
const err = (message, status = 400) => NextResponse.json({ error: message }, { status })

// ---- Allowed fields (never trust user_id/timestamps from client) ----
const CATEGORY_FIELDS = ['name', 'description', 'color', 'display_order', 'is_active']
const SERVICE_FIELDS = ['category_id', 'name', 'description', 'image_url', 'price', 'promo_price', 'promo_active', 'duration_minutes', 'buffer_before_minutes', 'buffer_after_minutes', 'color', 'display_order', 'is_active']
const STAFF_FIELDS = ['name', 'description', 'phone', 'email', 'photo_url', 'color', 'display_order', 'is_active']
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
        const { data } = await supabaseAdmin.from('booking_staff').select('*').eq('user_id', uid).order('display_order', { ascending: true })
        return json(data || [])
      }
      if (method === 'POST') {
        const row = { ...pick(body, STAFF_FIELDS), user_id: uid }
        if (!row.name) return err('El nombre es obligatorio')
        const { data, error } = await supabaseAdmin.from('booking_staff').insert(row).select().single()
        if (error) return err(error.message)
        // Optionally assign services in the same request
        if (Array.isArray(body.service_ids)) await setStaffServices(supabaseAdmin, uid, data.id, body.service_ids)
        return json(data)
      }
      if (method === 'PUT') {
        const { data, error } = await supabaseAdmin.from('booking_staff').update(pick(body, STAFF_FIELDS)).eq('id', id).eq('user_id', uid).select().single()
        if (error) return err(error.message)
        if (Array.isArray(body.service_ids)) await setStaffServices(supabaseAdmin, uid, id, body.service_ids)
        return json(data)
      }
      if (method === 'DELETE') {
        const { count } = await supabaseAdmin.from('appointments').select('*', { count: 'exact', head: true }).eq('staff_id', id).eq('user_id', uid)
        if (count && count > 0) {
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
        let q = supabaseAdmin.from('booking_staff_services').select('staff_id,service_id').eq('user_id', uid)
        if (staffId) q = q.eq('staff_id', staffId)
        const { data } = await q
        return json(data || [])
      }
      if (method === 'POST') {
        const { staff_id, service_ids } = body
        if (!staff_id) return err('Falta el profesional')
        await setStaffServices(supabaseAdmin, uid, staff_id, service_ids || [])
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

    return err('Ruta de agenda no encontrada', 404)
  } catch (e) {
    console.error('booking route error:', e?.message)
    const t = translateBookingError(e)
    return err(t.message, 400)
  }
}

async function setStaffServices(supabaseAdmin, uid, staffId, serviceIds) {
  await supabaseAdmin.from('booking_staff_services').delete().eq('user_id', uid).eq('staff_id', staffId)
  const rows = (serviceIds || []).filter(Boolean).map(sid => ({ user_id: uid, staff_id: staffId, service_id: sid }))
  if (rows.length > 0) await supabaseAdmin.from('booking_staff_services').insert(rows)
}

async function createAppointment(supabaseAdmin, businessUserId, body, source, createdBy) {
  const serviceIds = body.service_ids || body.serviceIds || []
  const { data, error } = await supabaseAdmin.rpc('create_booking_appointment', {
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
      supabaseAdmin.from('booking_staff').select(STAFF_PUBLIC).eq('user_id', bid).eq('is_active', true).order('display_order'),
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
    return json(data || [])
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
    return await createAppointment(supabaseAdmin, bid, body, 'public', null)
  }

  return err('Ruta pública de agenda no encontrada', 404)
}
