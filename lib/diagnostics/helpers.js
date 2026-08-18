'use client'

// Shared helpers for the hair-diagnostics module (client side).

export async function authFetch(supabase, url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
  return fetch(url, { ...options, headers })
}

export function calcAge(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export function fmtDate(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '—' }
}

export function fmtDateTime(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

export const STATUS_LABELS = {
  draft: { label: 'Borrador', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  completed: { label: 'Finalizada', cls: 'bg-green-100 text-green-800 border-green-300' },
  archived: { label: 'Archivada', cls: 'bg-gray-200 text-gray-700 border-gray-300' },
}

// Upload a signature Blob directly from the browser to the private bucket.
// Path is scoped to the authenticated user's folder (RLS enforced).
export async function uploadSignature(supabase, userId, diagnosticId, which, blob) {
  const path = `${userId}/${diagnosticId}/${which}.webp`
  const { error } = await supabase.storage
    .from('diagnostic-signatures')
    .upload(path, blob, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  return path
}

// Render an answer value to a readable string.
export function answerToText(a) {
  if (!a) return ''
  if (a.selected_values && Array.isArray(a.selected_values) && a.selected_values.length) {
    return a.selected_values.map(v => (typeof v === 'object' ? (v.label || v.value) : v)).join(', ')
  }
  if (a.option_label) return a.option_label
  if (a.text_value != null && a.text_value !== '') return String(a.text_value)
  if (a.number_value != null) return String(a.number_value)
  if (a.date_value) return fmtDate(a.date_value)
  if (a.boolean_value != null) return a.boolean_value ? 'Sí' : 'No'
  return ''
}
