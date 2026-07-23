import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync('/app/.env','utf8')
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'')
const url = get('NEXT_PUBLIC_SUPABASE_URL'); const svc = get('SUPABASE_SERVICE_ROLE_KEY'); const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const admin = createClient(url, svc, { auth:{persistSession:false}})
const uid = 'a582bcdb-a486-43be-bc86-a25d5ab70a6d'
const SEL='id,category_id,name,description,image_url,price,promo_price,promo_active,is_featured,is_active,stock_quantity,display_order,createdAt,categories(name)'

// 1) service role (bypass RLS)
const { data: d1, error: e1 } = await admin.from('products').select(SEL).eq('user_id',uid).order('createdAt',{ascending:false})
console.log('SERVICE ROLE -> err:', e1?.message, '| count:', d1?.length)

// 2) Set monserrat password temporarily to test RLS path, then test /api/products via anon token
const { data: link, error: le } = await admin.auth.admin.updateUserById(uid, { password: 'TempTest123!' })
console.log('set pw err:', le?.message)
const uc = createClient(url, anon, { auth:{persistSession:false}})
const { data: sess, error: se } = await uc.auth.signInWithPassword({ email: 'monserrat271993@gmail.com', password: 'TempTest123!' })
console.log('signin err:', se?.message, '| uid:', sess?.user?.id)
if (sess?.session) {
  const { data: d2, error: e2 } = await uc.from('products').select(SEL).eq('user_id', sess.user.id).order('createdAt',{ascending:false})
  console.log('RLS CLIENT (monserrat) -> err:', e2?.message, '| count:', d2?.length)
  // also via the actual API with Bearer
  const r = await fetch('http://localhost:3000/api/products', { headers: { Authorization: 'Bearer '+sess.session.access_token } })
  const j = await r.json()
  console.log('API /api/products status:', r.status, '| count:', Array.isArray(j)? j.length : JSON.stringify(j).slice(0,200))
}
process.exit(0)
