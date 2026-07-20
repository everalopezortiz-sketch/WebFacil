# Test Credentials

## Admin / Developer Account
- Email: `everlopez@gmail.com`
- Password: `ever123`
- Role: DESARROLLADOR (Admin Panel)

## Regular User Account (Dashboard / store owner)
- Email: `ortiz@gmail.com`
- Password: `ortiz123`
- Store slug (public): `ever-lopez-mkzxa88e` (belongs to Ever Lopez store)

## Notes
- Auth managed by Supabase (session via cookies with @supabase/ssr)
- Admin panel triggered when profile.role === 'DESARROLLADOR'
- Public store URL: /store/{slug}
- IMPORTANT: A DB migration must be run in Supabase for new features:
  see /app/memory/stock_migration.sql (adds products.stock_quantity,
  user_settings.store_name, and table store_visits). Backend has a
  fallback so settings still save even if store_name column is missing.
