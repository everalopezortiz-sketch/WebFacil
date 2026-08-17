// Translate technical booking error codes (thrown by Supabase RPC functions)
// into clear Spanish messages for the end user.

export const BOOKING_ERROR_MESSAGES = {
  BOOKING_SERVICES_REQUIRED: 'Selecciona al menos un servicio.',
  BOOKING_SERVICE_INVALID: 'Uno de los servicios ya no está disponible.',
  BOOKING_CUSTOMER_NAME_REQUIRED: 'Ingresa el nombre del cliente.',
  BOOKING_CUSTOMER_PHONE_REQUIRED: 'Ingresa el teléfono del cliente.',
  BOOKING_BUSINESS_INVALID: 'Este negocio no tiene habilitados los agendamientos.',
  BOOKING_STAFF_INVALID: 'El profesional seleccionado no está disponible.',
  BOOKING_STAFF_SERVICE_INVALID: 'El profesional no realiza todos los servicios seleccionados.',
  BOOKING_MIN_NOTICE_VIOLATION: 'Este horario no cumple con la anticipación mínima.',
  BOOKING_MAX_ADVANCE_VIOLATION: 'La fecha supera el límite de anticipación permitido.',
  BOOKING_OUTSIDE_AVAILABILITY: 'El horario está fuera de la jornada del profesional.',
  BOOKING_TIME_OFF_CONFLICT: 'El profesional no está disponible en ese horario.',
  BOOKING_SLOT_UNAVAILABLE: 'Ese horario acaba de ser reservado. Selecciona otro.',
  BOOKING_APPOINTMENT_NOT_FOUND: 'No se encontró la reserva.',
  BOOKING_APPOINTMENT_NOT_RESCHEDULABLE: 'Esta reserva ya no puede reprogramarse.',
  BOOKING_START_IN_PAST: 'No puedes seleccionar un horario pasado.',
  BOOKING_STATUS_INVALID: 'El estado seleccionado no es válido.',
}

// Given a Supabase/PG error object or message, extract a known code and return
// a friendly Spanish message. Falls back to a generic message.
export function translateBookingError(err) {
  const raw = (err && (err.message || err.details || err.hint)) || String(err || '')
  for (const code of Object.keys(BOOKING_ERROR_MESSAGES)) {
    if (raw.includes(code)) {
      return { code, message: BOOKING_ERROR_MESSAGES[code] }
    }
  }
  return { code: 'BOOKING_ERROR', message: 'No se pudo completar la operación de agenda. Intenta nuevamente.' }
}
