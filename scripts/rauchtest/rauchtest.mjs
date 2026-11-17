// Rauchtest: echte gebaute App mit (falscher) Sitzung -> stuerzt eine Seite ab?
import puppeteer from 'puppeteer-core'
import fs from 'fs'
const VIDEO = fs.readFileSync('/tmp/v.mp4')
const base = 'http://localhost:4173'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated', exp, email: 'test@sowloynab.de' })}.x`
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
  user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@sowloynab.de', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
const seiten = process.argv.slice(2)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
// Realtime-Socket vortaeuschen: oeffnet sofort, antwortet nie -> Kanaele bleiben "joining",
// genau der Zustand, in dem supabase-js bei doppelten Kanalnamen wirft.
await page.evaluateOnNewDocument(() => {
  class FakeWS { constructor(url) { this.url = url; this.readyState = 1; setTimeout(() => { this.onopen && this.onopen({}) }, 0) }
    send() {} close() { this.readyState = 3; this.onclose && this.onclose({ code: 1000 }) } }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3
  window.WebSocket = FakeWS
})
// Supabase-Antworten vortaeuschen (leere Daten), damit alle Seiten fertig rendern
await page.setRequestInterception(true)
page.on('request', (req) => {
  const u = req.url()
  if (!u.includes('supabase.co')) return req.continue()
  const objekt = (req.headers()['accept'] || '').includes('pgrst.object')
  let body = objekt ? 'null' : '[]'
  if (u.includes('/auth/v1/user')) body = JSON.stringify(session.user)
  if (u.includes('/functions/v1/')) body = '{}'
  if (u.includes('/demo.mp4')) {
    const r = /bytes=(\d+)-(\d*)/.exec(req.headers()['range'] || '')
    if (!r) return req.respond({ status: 200, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' }, body: VIDEO })
    const a = Number(r[1]), b = r[2] ? Number(r[2]) : VIDEO.length - 1
    return req.respond({ status: 206, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${VIDEO.length}`, 'access-control-allow-origin': '*' }, body: VIDEO.subarray(a, b + 1) })
  }
  const kunde = { name: 'Das Licht eV.', logo_url: null, active: true, pausiert_seit: null, deleted_at: null }
  const VOBJ = { id: 'v1', title: 'Ein Samstag – 50 Portionen', client_id: 'c1', status: 'todo', produktion_stufe: 'pruefung', scheduled_date: '2026-11-18', dropbox_pfad: null, archiv_pfad: null, video_url: 'https://x.supabase.co/demo.mp4', chat_url: null, clients: kunde }
  if (u.includes('/rest/v1/videos') && (objekt || u.includes('id=eq.'))) body = JSON.stringify(objekt ? VOBJ : [VOBJ])
  else if (u.includes('/rest/v1/videos')) body = JSON.stringify([
    { id: 'v1', title: 'Ein Samstag – 50 Portionen', client_id: 'c1', status: 'todo', produktion_stufe: 'pruefung', scheduled_date: '2026-11-18', dropbox_pfad: '/x', clients: kunde },
    { id: 'v2', title: 'Alafandi', client_id: 'c1', status: 'todo', produktion_stufe: null, scheduled_date: '2026-11-13', dropbox_pfad: null, clients: kunde },
    { id: 'v3', title: 'Ludgerikreisel Teil 2', client_id: 'c2', status: 'todo', produktion_stufe: 'roh', scheduled_date: '2026-11-21', dropbox_pfad: '/y', clients: { ...kunde, name: 'Fahrschule Hajo' } }])
  if (u.includes('/rest/v1/video_kommentare') && req.method() === 'GET') body = JSON.stringify([
    { id: 'k1', video_id: 'v1', datei: null, sekunde: 4.2, bis_sekunde: null, x: 0.5, y: 0.35, text: 'Titel eine Zeile tiefer, verdeckt die Stirn', erledigt: false, aenderung_id: null, member_id: null, created_at: '' },
    { id: 'k2', video_id: 'v1', datei: null, sekunde: 12.6, bis_sekunde: 14.1, x: null, y: null, text: 'Musik hier leiser', erledigt: false, aenderung_id: null, member_id: null, created_at: '' }])
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' }, body })
})
const fehler = []
page.on('pageerror', (e) => fehler.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::|fetch|NetworkError|WebSocket|realtime/i.test(m.text())) fehler.push('CONSOLE ' + m.text().slice(0, 200)) })
await page.goto(base + '/login')
await page.evaluate((s) => { localStorage.setItem('sb-kxrbeyecsdvejhvxtrin-auth-token', JSON.stringify(s)); localStorage.setItem('sl-identity-member', '01c73736-56de-481a-b87d-fd813f4c548d') }, session)
let ok = true
for (const s of seiten) {
  fehler.length = 0
  await page.goto(base + s, { waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, 3500))
  const text = await page.evaluate(() => document.body.innerText)
  const crash = text.includes('Kurz was schiefgelaufen')
  const pfad = await page.evaluate(() => location.pathname)
  await page.screenshot({ path: `shot_${s.replace(/\W/g, '_') || 'root'}.png` })
  console.log(`${crash ? 'ABSTURZ' : 'ok     '} ${s} -> ${pfad} ${fehler.length ? '\n   ' + fehler.join('\n   ') : ''}`)
  if (crash || fehler.some((f) => f.startsWith('PAGEERROR'))) ok = false
}
await browser.close()
process.exit(ok ? 0 : 1)
