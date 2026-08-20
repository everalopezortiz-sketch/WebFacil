import { NextResponse } from 'next/server'
import crypto from 'crypto'

// ------------------------------------------------------------------
// Hair diagnostic module (Fichas capilares) — server-only dispatcher.
// All DB access goes through service_role (supabaseAdmin) but is ALWAYS
// scoped to the authenticated user's id obtained from the session, never
// from the request body/query. Only business_type === 'booking' allowed.
// ------------------------------------------------------------------

const json = (data, status = 200, headers = {}) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
const err = (message, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } })

const SIGN_BUCKET = 'diagnostic-signatures'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v)
const VALID_STATUS = ['draft', 'completed', 'archived']

// Fields accepted from client for a client record (never trust user_id).
const CLIENT_FIELDS = ['full_name', 'phone', 'document', 'email', 'birth_date', 'gender', 'address', 'city', 'occupation', 'general_notes', 'is_active']

function pick(body, fields) {
  const out = {}
  fields.forEach(f => { if (body[f] !== undefined) out[f] = body[f] })
  return out
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

async function getUser(supabase, supabaseAdmin, authHeader) {
  let { data: { user } } = await supabase.auth.getUser()
  if (!user && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '')
    const { data } = await supabaseAdmin.auth.getUser(token)
    user = data?.user
  }
  return user
}

// Verify the user runs a booking business. Returns profile row or null.
async function requireBookingProfile(supabaseAdmin, uid) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id,business_type')
    .eq('id', uid)
    .single()
  if (!data || data.business_type !== 'booking') return null
  return data
}

// Create short-lived signed URLs for the two signature files (if present).
async function signSignatures(supabaseAdmin, record) {
  const out = { client_signature_url: null, professional_signature_url: null }
  if (!record) return out
  try {
    if (record.client_signature_path) {
      const { data } = await supabaseAdmin.storage.from(SIGN_BUCKET).createSignedUrl(record.client_signature_path, 300)
      out.client_signature_url = data?.signedUrl || null
    }
    if (record.professional_signature_path) {
      const { data } = await supabaseAdmin.storage.from(SIGN_BUCKET).createSignedUrl(record.professional_signature_path, 300)
      out.professional_signature_url = data?.signedUrl || null
    }
  } catch { /* ignore signing errors */ }
  return out
}

function bundleArgs(uid, body, forcedRecordId) {
  return {
    p_user_id: uid,
    p_client_id: body.client_id,
    p_status: VALID_STATUS.includes(body.status) ? body.status : 'draft',
    p_record_id: forcedRecordId ? forcedRecordId : (isUuid(body.record_id) ? body.record_id : null),
    p_professional_id: isUuid(body.professional_id) ? body.professional_id : null,
    p_professional_name: body.professional_name || null,
    p_diagnostic_date: body.diagnostic_date || null,
    p_consultation_reason: body.consultation_reason || null,
    p_general_observations: body.general_observations || null,
    p_diagnosis_summary: body.diagnosis_summary || null,
    p_treatment_plan: body.treatment_plan || null,
    p_recommendations: body.recommendations || null,
    p_next_check_date: body.next_check_date || null,
    p_next_session_notes: body.next_session_notes || null,
    p_exposure_minutes: body.exposure_minutes != null ? parseInt(body.exposure_minutes) : null,
    p_exposure_notes: body.exposure_notes || null,
    p_client_signature_path: body.client_signature_path || null,
    p_professional_signature_path: body.professional_signature_path || null,
    p_client_signed_at: body.client_signed_at || null,
    p_professional_signed_at: body.professional_signed_at || null,
    p_consent_accepted_at: body.consent_accepted_at || null,
    p_answers: Array.isArray(body.answers) ? body.answers : [],
    p_products: Array.isArray(body.products) ? body.products : [],
  }
}

/**
 * Main diagnostics dispatcher. Returns a NextResponse for diagnostics routes,
 * otherwise null so the main catch-all continues.
 * ctx: { method, supabase, supabaseAdmin, path, pathStr, body, searchParams, authHeader, origin }
 */
export async function handleDiagnosticsRoute(ctx) {
  const { method, supabase, supabaseAdmin, path, pathStr, body = {}, searchParams, authHeader } = ctx

  if (!(pathStr === 'diagnostics' || pathStr.startsWith('diagnostics/'))) return null

  try {
    const sub = path[1]      // catalog | clients | records | field-options | settings | shared
    const id = path[2]       // resource id / token
    const action = path[3]   // share | pdf

    // ---------- PUBLIC: shared diagnostic by token (no auth) ----------
    if (sub === 'shared') {
      if (method !== 'GET') return err('Método no permitido', 405)
      const token = id
      if (!token || token.length < 10) return err('Enlace no válido', 404)
      const tokenHash = sha256Hex(token)
      const { data, error } = await supabaseAdmin.rpc('get_shared_diagnostic_bundle', { p_token_hash: tokenHash })
      if (error) return err('Enlace no válido o vencido', 404)
      const bundle = Array.isArray(data) ? data[0] : data
      if (!bundle || !bundle.record) return err('Enlace no válido o vencido', 404)
      const sigs = await signSignatures(supabaseAdmin, bundle.record)
      return json({ ...bundle, ...sigs })
    }

    // ---------- AUTHENTICATED ROUTES ----------
    const user = await getUser(supabase, supabaseAdmin, authHeader)
    if (!user) return err('Unauthorized', 401)
    const uid = user.id
    const prof = await requireBookingProfile(supabaseAdmin, uid)
    if (!prof) return err('Este negocio no tiene habilitadas las fichas capilares.', 403)

    // ===== CATALOG (fields + options + settings) =====
    if (sub === 'catalog' && method === 'GET') {
      const [fieldsRes, optionsRes, settingsRes] = await Promise.all([
        supabaseAdmin.from('diagnostic_fields')
          .select('id,field_key,label,section_key,section_label,field_type,placeholder,help_text,is_required,allow_custom_value,display_order')
          .eq('user_id', uid).eq('is_active', true).order('display_order', { ascending: true }),
        supabaseAdmin.from('diagnostic_field_options')
          .select('id,field_id,value,label,display_order').eq('user_id', uid).eq('is_active', true).order('display_order', { ascending: true }),
        supabaseAdmin.from('diagnostic_settings')
          .select('next_record_number,pdf_title,pdf_primary_color,pdf_footer,default_share_expiry_days').eq('user_id', uid).maybeSingle(),
      ])
      const options = optionsRes.data || []
      const optByField = {}
      options.forEach(o => { (optByField[o.field_id] = optByField[o.field_id] || []).push(o) })
      const fields = (fieldsRes.data || []).map(f => ({ ...f, options: optByField[f.id] || [] }))
      return json({ fields, settings: settingsRes.data || null })
    }

    // ===== SETTINGS =====
    if (sub === 'settings') {
      if (method === 'GET') {
        const { data } = await supabaseAdmin.from('diagnostic_settings').select('*').eq('user_id', uid).maybeSingle()
        return json(data || null)
      }
      if (method === 'PUT' || method === 'PATCH') {
        const upd = pick(body, ['pdf_title', 'pdf_primary_color', 'pdf_footer', 'default_share_expiry_days'])
        if (upd.default_share_expiry_days !== undefined) {
          const d = parseInt(upd.default_share_expiry_days)
          upd.default_share_expiry_days = Math.min(90, Math.max(1, isNaN(d) ? 7 : d))
        }
        const { data, error } = await supabaseAdmin.from('diagnostic_settings').update(upd).eq('user_id', uid).select().maybeSingle()
        if (error) return err('No se pudo guardar la configuración.')
        return json(data)
      }
    }

    // ===== FIELD OPTIONS (save custom option for future forms / toggle visibility) =====
    if (sub === 'field-options') {
      // PATCH visibility of an existing option
      if (id && isUuid(id) && (method === 'PATCH' || method === 'PUT')) {
        const { data, error } = await supabaseAdmin.from('diagnostic_field_options')
          .update({ is_active: !!body.is_active }).eq('id', id).eq('user_id', uid).select('id,is_active').maybeSingle()
        if (error || !data) return err('No se pudo actualizar la opción.', error ? 400 : 404)
        return json(data)
      }
      if (!id && method === 'POST') {
      const fieldId = body.field_id
      const label = (body.label || body.value || '').toString().trim()
      const value = (body.value || label).toString().trim().slice(0, 200)
      if (!isUuid(fieldId)) return err('Campo no válido.')
      if (!label) return err('Ingresa un valor para la opción.')
      // Validate the field belongs to this user
      const { data: field } = await supabaseAdmin.from('diagnostic_fields').select('id').eq('id', fieldId).eq('user_id', uid).maybeSingle()
      if (!field) return err('El campo no pertenece a este negocio.', 403)
      // Avoid duplicates (case-insensitive on value)
      const { data: existing } = await supabaseAdmin.from('diagnostic_field_options')
        .select('id,value,label').eq('user_id', uid).eq('field_id', fieldId).ilike('value', value)
      if (existing && existing.length) return json(existing[0])
      const { data, error } = await supabaseAdmin.from('diagnostic_field_options')
        .insert({ user_id: uid, field_id: fieldId, value, label: label.slice(0, 200), is_active: true, display_order: 999 })
        .select().single()
      if (error) return err('No se pudo guardar la opción.')
      return json(data, 201)
    }
    }

    // ===== FIELDS ADMIN (customize which fields/options appear on NEW forms) =====
    if (sub === 'fields') {
      // GET list: ALL fields + options (active and inactive) grouped for settings UI
      if (!id && method === 'GET') {
        const [fieldsRes, optionsRes] = await Promise.all([
          supabaseAdmin.from('diagnostic_fields')
            .select('id,field_key,label,section_key,section_label,field_type,is_required,display_order,is_active')
            .eq('user_id', uid).order('display_order', { ascending: true }),
          supabaseAdmin.from('diagnostic_field_options')
            .select('id,field_id,value,label,display_order,is_active').eq('user_id', uid).order('display_order', { ascending: true }),
        ])
        const options = optionsRes.data || []
        const optByField = {}
        options.forEach(o => { (optByField[o.field_id] = optByField[o.field_id] || []).push(o) })
        const fields = (fieldsRes.data || []).map(f => ({ ...f, options: optByField[f.id] || [] }))
        return json({ fields })
      }
      // PATCH a whole section in one batch operation
      if (id === 'section' && (method === 'PATCH' || method === 'PUT')) {
        const sectionKey = (body.section_key || '').toString()
        if (!sectionKey) return err('Sección no válida.')
        const isActive = !!body.is_active
        const { error } = await supabaseAdmin.from('diagnostic_fields')
          .update({ is_active: isActive }).eq('user_id', uid).eq('section_key', sectionKey)
        if (error) return err('No se pudo actualizar la sección.')
        return json({ success: true })
      }
      // PATCH a single field's visibility
      if (id && isUuid(id) && (method === 'PATCH' || method === 'PUT')) {
        const { data, error } = await supabaseAdmin.from('diagnostic_fields')
          .update({ is_active: !!body.is_active }).eq('id', id).eq('user_id', uid).select('id,is_active').maybeSingle()
        if (error || !data) return err('No se pudo actualizar el campo.', error ? 400 : 404)
        return json(data)
      }
    }

    // ===== CLIENTS =====
    if (sub === 'clients') {
      // GET list / search (cursor pagination via RPC)
      if (!id && method === 'GET') {
        const q = (searchParams.get('q') || '').trim()
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit')) || 20))
        const cursorCreatedAt = searchParams.get('cursor_created_at') || null
        const cursorId = searchParams.get('cursor_id') || null
        const args = { p_user_id: uid, p_limit: limit }
        if (q) args.p_query = q
        if (cursorCreatedAt) args.p_cursor_created_at = cursorCreatedAt
        if (cursorId && isUuid(cursorId)) args.p_cursor_id = cursorId
        const { data, error } = await supabaseAdmin.rpc('search_diagnostic_clients', args)
        if (error) return err('No se pudo obtener la lista de clientes.')
        const rows = data || []
        const last = rows.length ? rows[rows.length - 1] : null
        const nextCursor = rows.length >= limit && last
          ? { created_at: last.created_at, id: last.id }
          : null
        return json({ clients: rows, nextCursor })
      }
      // POST create
      if (!id && method === 'POST') {
        const row = { ...pick(body, CLIENT_FIELDS), user_id: uid }
        if (!row.full_name || !row.full_name.trim()) return err('Ingresa el nombre del cliente.')
        if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return err('El email no es válido.')
        if (row.birth_date && isNaN(Date.parse(row.birth_date))) return err('La fecha de nacimiento no es válida.')
        const { data, error } = await supabaseAdmin.from('clients').insert(row).select().single()
        if (error) return err('No se pudo crear el cliente.')
        return json(data, 201)
      }
      // GET single / PATCH update
      if (id) {
        if (!isUuid(id)) return err('Cliente no válido.')
        if (method === 'GET') {
          const { data } = await supabaseAdmin.from('clients').select('*').eq('id', id).eq('user_id', uid).maybeSingle()
          if (!data) return err('Cliente no encontrado.', 404)
          return json(data)
        }
        if (method === 'PATCH' || method === 'PUT') {
          const upd = pick(body, CLIENT_FIELDS)
          if (upd.email && !/^\S+@\S+\.\S+$/.test(upd.email)) return err('El email no es válido.')
          if (upd.birth_date && isNaN(Date.parse(upd.birth_date))) return err('La fecha de nacimiento no es válida.')
          const { data, error } = await supabaseAdmin.from('clients').update(upd).eq('id', id).eq('user_id', uid).select().single()
          if (error) return err('No se pudo actualizar el cliente.')
          return json(data)
        }
      }
    }

    // ===== RECORDS =====
    if (sub === 'records') {
      // GET compact list
      if (!id && method === 'GET') {
        const clientId = searchParams.get('client_id')
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit')) || 20))
        const cursor = searchParams.get('cursor') // record_number
        let q = supabaseAdmin.from('diagnostic_records')
          .select('id,record_number,client_id,client_full_name_snapshot,professional_name_snapshot,diagnostic_date,status,updated_at')
          .eq('user_id', uid)
        if (clientId && isUuid(clientId)) q = q.eq('client_id', clientId)
        if (cursor && /^\d+$/.test(cursor)) q = q.lt('record_number', parseInt(cursor))
        q = q.order('record_number', { ascending: false }).limit(limit)
        const { data, error } = await q
        if (error) return err('No se pudieron obtener las fichas.')
        const rows = data || []
        const nextCursor = rows.length >= limit ? rows[rows.length - 1].record_number : null
        return json({ records: rows, nextCursor })
      }
      // POST save bundle (CREATE only — never pass a record_id here)
      if (!id && method === 'POST') {
        if (!isUuid(body.client_id)) return err('Selecciona un cliente.')
        if (body.exposure_minutes != null) {
          const em = parseInt(body.exposure_minutes)
          if (isNaN(em) || em < 0 || em > 1440) return err('El tiempo de exposición debe estar entre 0 y 1440 minutos.')
        }
        // For a brand-new record we ignore any record_id coming from the body,
        // unless the client is doing a two-phase create (signature upload) and
        // explicitly re-sends the id it just received.
        const forced = isUuid(body.record_id) ? body.record_id : null
        const { data, error } = await supabaseAdmin.rpc('save_diagnostic_bundle', bundleArgs(uid, body, forced))
        if (error) return err('No se pudo guardar la ficha. Verifica los datos.')
        const recordId = typeof data === 'string' ? data : (data?.id || data?.diagnostic_id)
        return json({ id: recordId })
      }
      // record-specific
      if (id) {
        if (!isUuid(id)) return err('Ficha no válida.')

        // PUT update an EXISTING record (id comes from the route, never the body)
        if ((method === 'PUT' || method === 'PATCH') && !action) {
          if (!isUuid(body.client_id)) return err('Selecciona un cliente.')
          // Ownership check: the record must exist and belong to this user
          const { data: rec } = await supabaseAdmin.from('diagnostic_records').select('id').eq('id', id).eq('user_id', uid).maybeSingle()
          if (!rec) return err('Ficha no encontrada.', 404)
          if (body.exposure_minutes != null) {
            const em = parseInt(body.exposure_minutes)
            if (isNaN(em) || em < 0 || em > 1440) return err('El tiempo de exposición debe estar entre 0 y 1440 minutos.')
          }
          const { data, error } = await supabaseAdmin.rpc('save_diagnostic_bundle', bundleArgs(uid, body, id))
          if (error) return err('No se pudo guardar la ficha. Verifica los datos.')
          const recordId = typeof data === 'string' ? data : (data?.id || data?.diagnostic_id || id)
          return json({ id: recordId })
        }

        // DELETE a record permanently (removes signatures from storage too)
        if (method === 'DELETE' && !action) {
          const { data: rec } = await supabaseAdmin.from('diagnostic_records')
            .select('id,client_signature_path,professional_signature_path').eq('id', id).eq('user_id', uid).maybeSingle()
          if (!rec) return err('Ficha no encontrada.', 404)
          const paths = [rec.client_signature_path, rec.professional_signature_path].filter(Boolean)
          if (paths.length) {
            try { await supabaseAdmin.storage.from(SIGN_BUCKET).remove(paths) } catch { /* ignore missing files */ }
          }
          const { error } = await supabaseAdmin.from('diagnostic_records').delete().eq('id', id).eq('user_id', uid)
          if (error) return err('No se pudo eliminar la ficha.')
          return json({ success: true })
        }

        // GET bundle (also used by /pdf)
        if ((method === 'GET') && (!action || action === 'pdf')) {
          const { data, error } = await supabaseAdmin.rpc('get_diagnostic_bundle', { p_user_id: uid, p_diagnostic_id: id })
          if (error) return err('No se pudo obtener la ficha.')
          const bundle = Array.isArray(data) ? data[0] : data
          if (!bundle || !bundle.record) return err('Ficha no encontrada.', 404)
          const sigs = await signSignatures(supabaseAdmin, bundle.record)
          return json({ ...bundle, ...sigs })
        }

        // SHARE create / revoke
        if (action === 'share') {
          if (method === 'POST') {
            // Only completed records can be shared
            const { data: rec } = await supabaseAdmin.from('diagnostic_records').select('id,status').eq('id', id).eq('user_id', uid).maybeSingle()
            if (!rec) return err('Ficha no encontrada.', 404)
            if (rec.status !== 'completed') return err('Solo puedes compartir una ficha finalizada.')
            // Determine expiry
            const { data: settings } = await supabaseAdmin.from('diagnostic_settings').select('default_share_expiry_days').eq('user_id', uid).maybeSingle()
            let days = parseInt(body.expiry_days) || (settings?.default_share_expiry_days || 7)
            days = Math.min(90, Math.max(1, days))
            const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
            // Generate secure token, store only its sha256 hash
            const token = crypto.randomBytes(24).toString('base64url')
            const tokenHash = sha256Hex(token)
            const { data, error } = await supabaseAdmin.rpc('create_diagnostic_share_link', {
              p_user_id: uid, p_diagnostic_id: id, p_token_hash: tokenHash, p_expires_at: expiresAt,
            })
            if (error) return err('No se pudo generar el enlace.')
            const linkId = typeof data === 'string' ? data : (data?.id || data?.link_id || null)
            return json({ token, link_id: linkId, path: `/f/${token}`, expires_at: expiresAt })
          }
          if (method === 'DELETE') {
            const linkId = body.link_id || searchParams.get('link_id')
            if (!isUuid(linkId)) return err('Enlace no válido.')
            const { error } = await supabaseAdmin.rpc('revoke_diagnostic_share_link', { p_user_id: uid, p_link_id: linkId })
            if (error) return err('No se pudo revocar el enlace.')
            return json({ success: true })
          }
          // List active share links for a record
          if (method === 'GET') {
            const { data } = await supabaseAdmin.from('diagnostic_share_links')
              .select('id,token_hint,expires_at,revoked_at,access_count,created_at,last_accessed_at')
              .eq('user_id', uid).eq('diagnostic_id', id).order('created_at', { ascending: false })
            return json(data || [])
          }
        }
      }
    }

    return err('Ruta no encontrada.', 404)
  } catch (e) {
    // Never leak internal details to the client
    console.error('[diagnostics] error:', e?.message)
    return err('No se pudo completar la operación.', 500)
  }
}
