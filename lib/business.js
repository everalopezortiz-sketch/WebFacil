// Central business module configuration.
// Determines which feature sets (commerce / bookings) each business type exposes.

export const BUSINESS_MODULES = {
  ecommerce: { commerce: true, bookings: false },
  booking: { commerce: true, bookings: true },
  restaurant: { commerce: true, bookings: false },
  personal: { commerce: false, bookings: false },
}

export function getModules(businessType) {
  return BUSINESS_MODULES[businessType] || BUSINESS_MODULES.ecommerce
}

export function hasBookings(businessType) {
  return !!getModules(businessType).bookings
}

export function hasCommerce(businessType) {
  return !!getModules(businessType).commerce
}

export const BUSINESS_TYPE_LABELS = {
  ecommerce: 'Tienda / Ecommerce',
  booking: 'Agendamientos + Tienda',
  restaurant: 'Local Gastronómico',
  personal: 'Página Personal',
}

export const BOOKING_DEFAULT_SETTINGS = {
  timezone: 'America/Asuncion',
  slot_interval_minutes: 30,
  min_booking_notice_minutes: 60,
  max_advance_days: 60,
  auto_confirm: true,
  allow_staff_choice: true,
  allow_multiple_services: true,
  require_phone: true,
  whatsapp_notifications: true,
  week_starts_on: 1,
}
