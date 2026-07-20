-- =========================================================
--  MIGRACIÓN COMPLETA - Ejecutar en Supabase:
--  Dashboard -> SQL Editor -> New Query -> pegar todo -> RUN
-- =========================================================

-- 1. Stock / Inventario (si aún no lo corriste)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS stock_quantity integer;

-- 2. Nombre de la tienda
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS store_name text;

-- 3. Tabla de visitas de la tienda (para el dashboard de estadísticas)
CREATE TABLE IF NOT EXISTS store_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_visits_user ON store_visits(user_id, created_at);

-- Permisos: el servidor usa la service role key (bypassa RLS),
-- por eso NO se necesitan políticas RLS adicionales.
-- (Opcional) habilitar RLS sin políticas para bloquear acceso público directo:
ALTER TABLE store_visits ENABLE ROW LEVEL SECURITY;

-- 4. Refrescar el caché del esquema
NOTIFY pgrst, 'reload schema';
