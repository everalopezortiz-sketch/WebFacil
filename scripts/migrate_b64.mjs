import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import crypto from 'crypto'

const env = fs.readFileSync('/app/.env','utf8')
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'')
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth:{persistSession:false}})
const BUCKET = 'webfacil-images'

const EXT = { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif' }

function parseArr(imageUrl){
  if (!imageUrl || typeof imageUrl!=='string') return []
  const t = imageUrl.trim()
  if (!t) return []
  if (t.startsWith('[')) { try { const a=JSON.parse(t); if(Array.isArray(a)) return a.filter(Boolean) } catch(e){} }
  if (t.includes('|') && !t.startsWith('data:')) return t.split('|').map(s=>s.trim()).filter(Boolean)
  return [t]
}
function serialize(arr){ const c=(arr||[]).filter(Boolean); if(c.length===0) return ''; if(c.length===1) return c[0]; return JSON.stringify(c) }

async function uploadB64(dataUri, userId, folder){
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const ext = EXT[mime] || 'bin'
  const buf = Buffer.from(m[2], 'base64')
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const uuid = crypto.randomUUID()
  const path = `${userId}/${folder}/${dateStr}-${uuid}.${ext}`
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { cacheControl:'31536000', contentType: mime, upsert:false })
  if (error) { console.error('  upload err:', error.message); return null }
  const { data:pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  return pub?.publicUrl || null
}

async function migrateProducts(){
  // get ids of products having base64
  const { data: rows, error } = await admin.from('products').select('id,user_id,image_url')
  if (error){ console.error('fetch products err', error.message); return }
  const targets = (rows||[]).filter(r => typeof r.image_url==='string' && r.image_url.includes('data:image'))
  console.log(`PRODUCTS to migrate: ${targets.length}`)
  let done=0, imgUp=0, fail=0
  for (const p of targets){
    try {
      const imgs = parseArr(p.image_url)
      const newImgs = []
      for (const im of imgs){
        if (typeof im==='string' && im.startsWith('data:')){
          const url = await uploadB64(im, p.user_id, 'products')
          if (url){ newImgs.push(url); imgUp++ } else { fail++ }
        } else newImgs.push(im)
      }
      const newVal = serialize(newImgs)
      const { error: ue } = await admin.from('products').update({ image_url: newVal }).eq('id', p.id)
      if (ue) console.error('  update err', p.id, ue.message)
      done++
      if (done % 10 === 0) console.log(`  ...${done}/${targets.length} (imgs uploaded ${imgUp}, fails ${fail})`)
    } catch(e){ console.error('  product err', p.id, e.message); fail++ }
  }
  console.log(`PRODUCTS done: ${done}, images uploaded: ${imgUp}, fails: ${fail}`)
}

async function migrateSettings(){
  const fields = { logo_url:'settings/logo', cover_image_url:'settings/cover', payment_qr_url:'settings/payment-qr' }
  const { data: rows, error } = await admin.from('user_settings').select('user_id,logo_url,cover_image_url,payment_qr_url')
  if (error){ console.error('fetch settings err', error.message); return }
  let cnt=0
  for (const s of (rows||[])){
    const upd = {}
    for (const [f,folder] of Object.entries(fields)){
      if (typeof s[f]==='string' && s[f].startsWith('data:')){
        const url = await uploadB64(s[f], s.user_id, folder)
        if (url){ upd[f]=url; cnt++ }
      }
    }
    if (Object.keys(upd).length){
      const { error: ue } = await admin.from('user_settings').update(upd).eq('user_id', s.user_id)
      if (ue) console.error('  settings update err', s.user_id, ue.message)
    }
  }
  console.log(`SETTINGS images migrated: ${cnt}`)
}

console.log('=== Starting base64 -> Storage migration ===')
await migrateProducts()
await migrateSettings()
console.log('=== Migration complete ===')
process.exit(0)
