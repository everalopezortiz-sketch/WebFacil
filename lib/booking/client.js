'use client'
// Shared authenticated fetch helper for client components.
// Attaches the current Supabase session token as a Bearer header.

export async function authFetch(supabase, url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
  return fetch(url, { ...options, headers })
}

export const WEEKDAYS = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 7, short: 'Dom', label: 'Domingo' },
]

export const STATUS_META = {
  pending: { label: 'Pendiente', color: '#f59e0b', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
  confirmed: { label: 'Confirmada', color: '#3b82f6', bg: 'bg-blue-100 text-blue-800 border-blue-300' },
  completed: { label: 'Completada', color: '#16a34a', bg: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'Cancelada', color: '#ef4444', bg: 'bg-red-100 text-red-800 border-red-300' },
  no_show: { label: 'No asistió', color: '#6b7280', bg: 'bg-gray-200 text-gray-700 border-gray-300' },
}

// ISO day of week (1=Mon ... 7=Sun) from a Date
export function isoDay(date) {
  const d = date.getDay() // 0=Sun..6=Sat
  return d === 0 ? 7 : d
}

// Format a date as YYYY-MM-DD in local time (avoids UTC day-shift)
export function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Start of the ISO week (Monday) for a given date
export function startOfWeek(date) {
  const d = new Date(date)
  const day = isoDay(d)
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}
