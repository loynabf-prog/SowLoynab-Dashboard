// App-Icons aus einem Quell-Logo erzeugen.
// Nutzung:  node scripts/make-icons.mjs <pfad-zum-logo> [hintergrundfarbe]
// Beispiel: node scripts/make-icons.mjs public/app-logo.png "#0f0f10"
//
// Erzeugt: public/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180),
//          icon-maskable-512.png  — jeweils mit deckendem Hintergrund (iPhone-tauglich).

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const src = process.argv[2] || 'public/app-logo.png'
const bg = process.argv[3] || '#ffffff'
const OUT = 'public/icons'

// hex -> {r,g,b}
function toRGB(hex) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), alpha: 1 }
}

// Logo mittig auf farbigen, quadratischen Hintergrund legen (mit Rand)
async function make(size, file, logoRatio) {
  const inner = Math.round(size * logoRatio)
  const logo = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: toRGB(bg) } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`)
  console.log('✓', file)
}

await mkdir(OUT, { recursive: true })
await make(192, 'icon-192.png', 0.82)
await make(512, 'icon-512.png', 0.82)
await make(180, 'apple-touch-icon.png', 0.82)
// Maskable braucht mehr Sicherheitsrand (Ecken werden abgeschnitten)
await make(512, 'icon-maskable-512.png', 0.66)
console.log('Fertig. Hintergrund:', bg, '| Quelle:', src)
