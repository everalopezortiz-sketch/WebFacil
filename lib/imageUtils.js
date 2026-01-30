/**
 * Normaliza una URL de imagen para soportar:
 * - Base64
 * - Google Drive links
 * - URLs directas
 */
export function normalizeImageSrc(src) {
  if (!src) return '';

  // Base64 → devolver tal cual
  if (src.startsWith('data:image')) {
    return src;
  }

  // Google Drive → convertir a link directo
  if (src.includes('drive.google.com/file/d/')) {
    const match = src.match(/\/d\/([^/]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
  }

  // Google Drive formato uc ya existente
  if (src.includes('drive.google.com/uc?')) {
    return src;
  }

  // Cualquier otra URL → devolver tal cual
  return src;
}
