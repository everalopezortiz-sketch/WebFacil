-- =========================================================
--  MIGRACIÓN: Función de Inventario / Stock
--  Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query
-- =========================================================

-- 1. Agregar la columna stock_quantity a la tabla products
--    (NULL = stock ilimitado, número = cantidad disponible)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS stock_quantity integer;

-- 2. (Opcional) Refrescar el caché del esquema de Supabase
NOTIFY pgrst, 'reload schema';

-- =========================================================
--  NOTA SOBRE PERMISOS:
--  No se necesitan tablas ni políticas (RLS) nuevas.
--  La tabla "products" ya tiene sus permisos configurados,
--  y la columna nueva los hereda automáticamente.
-- =========================================================
