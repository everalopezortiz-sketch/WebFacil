import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('/app/.env','utf8')
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'')
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const svc = get('SUPABASE_SERVICE_ROLE_KEY')
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
console.log('URL:', url)
const admin = createClient(url, svc, { auth: { persistSession:false } })

// 1. profiles
const { data: profiles, error: pe } = await admin.from('profiles').select('id, first_name, last_name, slug, role, is_active, business_type')
console.log('\n=== PROFILES (admin) err:', pe?.message, 'count:', profiles?.length)
;(profiles||[]).forEach(p => console.log(' -', p.first_name, p.last_name, '| slug:', p.slug, '| role:', p.role, '| active:', p.is_active))

// 2. products count + columns test
const { data: prods, error: pre } = await admin.from('products').select('id, name, user_id, stock_quantity, is_active').limit(5)
console.log('\n=== PRODUCTS (admin) err:', pre?.message, 'sample count:', prods?.length)
;(prods||[]).forEach(p => console.log(' -', p.name, '| user:', p.user_id, '| stock:', p.stock_quantity, '| active:', p.is_active))

// 3. strict public select test
const { data: sp, error: spe } = await admin.from('products').select('id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,stock_quantity,categories(name)').limit(2)
console.log('\n=== STRICT PUBLIC SELECT err:', spe?.message, 'count:', sp?.length)

// 4. user_settings store_name
const { data: us, error: use } = await admin.from('user_settings').select('user_id, store_name').limit(3)
console.log('\n=== user_settings.store_name err:', use?.message, 'count:', us?.length)

// 5. store_visits table
const { error: sve } = await admin.from('store_visits').select('id', { head:true, count:'exact' })
console.log('\n=== store_visits table err:', sve?.message || 'OK exists')

// 6. Simulate admin/users RLS query as anon (signin as everlopez)
const userClient = createClient(url, anon, { auth: { persistSession:false } })
const { data: sess, error: se } = await userClient.auth.signInWithPassword({ email:'everlopez@gmail.com', password:'ever123' })
console.log('\n=== SIGNIN everlopez err:', se?.message, 'uid:', sess?.user?.id)
if (sess?.user) {
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', sess.user.id).single()
  console.log('everlopez role:', prof?.role)
  const { data: allP, error: allE } = await userClient.from('profiles').select('*, user_settings(*), user_plans(*, plans(*))').order('createdAt',{ascending:false})
  console.log('admin/users RLS query -> err:', allE?.message, 'count:', allP?.length)
}
process.exit(0)
