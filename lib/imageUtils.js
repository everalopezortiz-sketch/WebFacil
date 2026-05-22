/**
 * Normaliza una URL/base64 para usarse como src en <img>.
 * - Si es base64 (data:image/...) la devuelve tal cual.
 * - Si es un link de Google Drive (file/d/ID/view o open?id=ID) la convierte al formato compatible con CORS.
 * - Cualquier otra URL la devuelve tal cual.
 */
export function normalizeImageSrc(src) {
  if (!src || typeof src !== 'string') return ''

  const s = src.trim()

  // base64
  if (s.startsWith('data:')) return s

  // Google Drive: extract ID
  const driveMatch = s.match(/(?:\/file\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/)
  if (driveMatch) {
    const id = driveMatch[1]
    // Formato compatible para mostrar imágenes
    return `https://lh3.googleusercontent.com/d/${id}`
  }

  // Cualquier otra URL → devolver tal cual
  return s
}

/**
 * Parses the product image_url field. Supports:
 *  - JSON array: '["url1","url2","url3"]' → ['url1','url2','url3']
 *  - Multiple URLs separated by | : 'url1|url2' → ['url1','url2']
 *  - Single URL (string) → ['url']
 *  - Empty/null → []
 * Always returns an array of normalized image sources.
 */
export function parseImages(imageUrl) {
  if (!imageUrl) return []
  if (Array.isArray(imageUrl)) {
    return imageUrl.filter(Boolean).map(normalizeImageSrc)
  }
  if (typeof imageUrl !== 'string') return []
  const trimmed = imageUrl.trim()
  if (!trimmed) return []
  // Try JSON array
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.filter(Boolean).map(normalizeImageSrc)
    } catch (e) {
      // fall through
    }
  }
  // Multi-URL separator
  if (trimmed.includes('|')) {
    return trimmed.split('|').map(s => s.trim()).filter(Boolean).map(normalizeImageSrc)
  }
  return [normalizeImageSrc(trimmed)]
}

/**
 * Serializes an array of image URLs into the single image_url storage field.
 * - Empty array → ''
 * - 1 item → just the string (backward compatible)
 * - 2+ items → JSON array string
 */
export function serializeImages(images) {
  const clean = (images || []).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  return JSON.stringify(clean)
}
