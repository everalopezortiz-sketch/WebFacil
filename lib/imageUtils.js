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

  // Google Drive → convertir a link de thumbnail (funciona mejor con CORS)
  if (src.includes('drive.google.com/file/d/')) {
    const match = src.match(/\/d\/([^/]+)/);
    if (match && match[1]) {
      // Usar lh3.googleusercontent.com que no tiene restricciones CORS
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }

  // Google Drive formato uc ya existente - convertir también
  if (src.includes('drive.google.com/uc?')) {
    const match = src.match(/[?&]id=([^&]+)/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }

  // Cualquier otra URL → devolver tal cual
  return src;
}
