-- ============================================================
-- WebFácil - Migración de nuevas funciones (Feb 2026)
-- Ejecutar UNA vez en el SQL Editor de Supabase.
-- Es idempotente: se puede correr varias veces sin problema.
-- ============================================================

-- 5) VER CONTRASEÑA EN PANEL ADMIN --------------------------
-- Supabase guarda el hash; para poder mostrarla al admin guardamos
-- una copia en texto al registrarse o cuando el admin la asigna.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plain_password text;

-- 1) VENTAS CON SEÑA + DESCUENTO -----------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit numeric DEFAULT 0;         -- seña pagada
ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_due numeric DEFAULT 0;     -- saldo pendiente
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;        -- descuento otorgado
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending'; -- pending | partial | paid

-- 3) GANANCIA: costo por producto + snapshot de costo en la venta
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
-- precio original (minorista) para calcular el descuento aplicado en ventas por mayor
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price numeric DEFAULT 0;

-- 4) COMBOS / KITS -------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_combo boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  combo_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  "createdAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_product_id);

-- 2) COMPRAS DE MATERIALES PARA STOCK ------------------------
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  unit text DEFAULT 'un',
  stock_quantity numeric DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  "createdAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materials_user ON materials(user_id);

CREATE TABLE IF NOT EXISTS material_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  type text NOT NULL,                 -- purchase | usage | adjust
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  note text,
  "createdAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matmov_material ON material_movements(material_id);

-- RLS: estas tablas se acceden solo vía la API con service_role.
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_movements ENABLE ROW LEVEL SECURITY;

-- (Opcional) permitir lectura de combo_items al público de la tienda por si se
-- desea mostrar el detalle del combo. Solo lectura.
DROP POLICY IF EXISTS combo_items_public_read ON combo_items;
CREATE POLICY combo_items_public_read ON combo_items FOR SELECT USING (true);
