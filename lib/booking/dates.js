export const BOOKING_TIMEZONE = 'America/Asuncion'
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function bookingDate(value = new Date(), timezone = BOOKING_TIMEZONE) {
  const format = (timeZone) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value))
    const part = (type) => parts.find(p => p.type === type).value
    return [part('year'), part('month'), part('day')].join('-')
  }
  try { return format(timezone) } catch { return format(BOOKING_TIMEZONE) }
}

export function addCalendarMonths(value, months) {
  const date = new Date(value + 'T00:00:00Z')
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(date)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  date.setUTCDate(Math.min(day, last.getUTCDate()))
  return date.toISOString().slice(0, 10)
}

export function formatCalendarDate(value, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  return new Intl.DateTimeFormat('es-PY', { ...options, timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
}
