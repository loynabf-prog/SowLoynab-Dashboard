// Kleiner, eigener Konfetti-Effekt (kein externes Paket).
// Aufruf: celebrate()  — feuert einen kurzen, edlen Konfetti-Regen in Markenfarben.

const COLORS = ['#e0521a', '#ff8a50', '#c69749', '#ffd8a8', '#ffffff']

export function celebrate(originX?: number, originY?: number) {
  if (typeof document === 'undefined') return
  // Respektiere "Bewegung reduzieren"
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = window.innerWidth
  const H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100000;`
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  const ox = originX ?? W / 2
  const oy = originY ?? H * 0.28
  const N = Math.min(160, Math.round(W / 8))
  const parts = Array.from({ length: N }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 5 + Math.random() * 9
    return {
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1,
    }
  })

  let raf = 0
  const start = performance.now()
  function frame(now: number) {
    const t = now - start
    ctx.clearRect(0, 0, W, H)
    let alive = false
    for (const p of parts) {
      p.vy += 0.28 // Schwerkraft
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life = Math.max(0, 1 - t / 1700)
      if (p.life > 0 && p.y < H + 40) {
        alive = true
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }
    }
    if (alive) raf = requestAnimationFrame(frame)
    else { cancelAnimationFrame(raf); canvas.remove() }
  }
  raf = requestAnimationFrame(frame)
  // Sicherheitsnetz
  setTimeout(() => { cancelAnimationFrame(raf); canvas.remove() }, 2600)
}
