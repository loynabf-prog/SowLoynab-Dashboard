// Das Studio -- der Raum der Agentur in 3D. Jedes Moebelstueck ist ein Knopf
// ins CRM; was dasteht, haengt vom Level ab. Gesperrte Stuecke stehen als
// Umriss im Raum, bis die Agentur das Level erreicht.
//
// Alles ist aus einfachen Koerpern gebaut (keine Modelle, kein Download):
// ein warmer, stiller Raum mit Holzboden, zwei Waenden, Fenster, Licht.

import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { AUSSTATTUNG, type Ausstattung, type Level } from '../lib/spiel'
import type { StudioLeben } from './daten'

export interface StudioProps {
  level: Level
  nacht: boolean
  leben: StudioLeben
  offeneQuests: number
  hits: number
  gewaehlt: string | null
  onWaehlen: (key: string | null) => void
}

// ------------------------------------------------------------- Farben
const F = {
  wand: '#263241', wandHell: '#2f3d4f', leiste: '#1b242f',
  holz: '#c89a62', holzDunkel: '#a87b48', eiche: '#8a5a32',
  weiss: '#f1ece4', schwarz: '#1a1d22', grau: '#5b6572', stahl: '#9aa3ad',
  orange: '#ff5f1f', gold: '#ffd87a', gruen: '#30d158', blau: '#64d2ff', rot: '#ff453a',
  teppich: '#b84a2a', teppichRand: '#8e3519', pflanze: '#2f8f4e', pflanzeDunkel: '#1f6b3a', topf: '#d9b28c',
  kork: '#c9a070', ziegel: '#8c4a3a', ziegelFuge: '#6b3528', sofa: '#3b5b6b',
}

const R = 5.5 // halbe Raumgroesse

/** true innerhalb eines gesperrten Stuecks -- HTML-Teile (Neon, Schildchen) bleiben dann weg. */
const GesperrtCtx = createContext(false)

// --------------------------------------------------------- Texturen
function holzTextur(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = F.holz; g.fillRect(0, 0, 1024, 1024)
  const bretter = 10, h = 1024 / bretter
  for (let i = 0; i < bretter; i++) {
    const y = i * h
    const t = 0.88 + ((i * 37) % 11) / 60
    g.fillStyle = `rgba(${Math.round(200 * t)}, ${Math.round(154 * t)}, ${Math.round(98 * t)}, 1)`
    g.fillRect(0, y, 1024, h - 3)
    g.fillStyle = 'rgba(70,40,20,.55)'; g.fillRect(0, y + h - 3, 1024, 3)
    // Fugen quer, versetzt
    const off = (i * 311) % 1024
    g.fillRect(off, y, 3, h - 3); g.fillRect((off + 512) % 1024, y, 3, h - 3)
    // Maserung
    g.strokeStyle = 'rgba(90,55,25,.18)'; g.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      g.beginPath(); const yy = y + 8 + k * (h / 6)
      g.moveTo(0, yy); g.bezierCurveTo(300, yy + 6, 700, yy - 6, 1024, yy + 3); g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1.6, 1.6); tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function fensterTextur(nacht: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 384)
  if (nacht) { grad.addColorStop(0, '#0b1130'); grad.addColorStop(1, '#2a1f4a') } else { grad.addColorStop(0, '#7fb8ff'); grad.addColorStop(1, '#f6d7b0') }
  g.fillStyle = grad; g.fillRect(0, 0, 512, 384)
  // Stadt-Silhouette (Muenster, frei erfunden)
  g.fillStyle = nacht ? '#141a3a' : '#9fb3c8'
  let x = 0
  const hs = [120, 180, 90, 240, 150, 110, 200, 130, 95, 170, 260, 140]
  hs.forEach((h, i) => { const w = 30 + ((i * 17) % 40); g.fillRect(x, 384 - h, w, h); x += w + 4 })
  if (nacht) {
    g.fillStyle = 'rgba(255,216,122,.85)'
    for (let i = 0; i < 90; i++) { const px = (i * 97) % 512, py = 384 - 20 - ((i * 53) % 200); if (((i * 7) % 3) !== 0) g.fillRect(px, py, 4, 6) }
    g.fillStyle = 'rgba(255,255,255,.9)'
    for (let i = 0; i < 40; i++) g.fillRect((i * 131) % 512, (i * 71) % 150, 2, 2)
  } else {
    g.fillStyle = 'rgba(255,255,255,.75)'
    for (const [cx, cy, r] of [[90, 70, 26], [130, 60, 34], [170, 75, 24], [380, 100, 30], [420, 90, 38], [460, 105, 26]] as const) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill() }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// --------------------------------------------------------- Bausteine
type MatProps = { color: string; emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number }
function Mat({ color, emissive = '#000000', emissiveIntensity = 0, roughness = 0.85, metalness = 0 }: MatProps) {
  return <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={roughness} metalness={metalness} />
}

function Kasten({ p, s, r = 0.03, mat, rot }: { p: [number, number, number]; s: [number, number, number]; r?: number; mat: MatProps; rot?: [number, number, number] }) {
  return (
    <RoundedBox args={s} radius={Math.min(r, Math.min(...s) / 2.01)} smoothness={3} position={p} rotation={rot} castShadow receiveShadow>
      <Mat {...mat} />
    </RoundedBox>
  )
}

function Zylinder({ p, r, h, mat, seg = 24 }: { p: [number, number, number]; r: number | [number, number]; h: number; mat: MatProps; seg?: number }) {
  const [rt, rb] = Array.isArray(r) ? r : [r, r]
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <Mat {...mat} />
    </mesh>
  )
}

// Ein anklickbares Stueck: hebt sich beim Zeigen leicht, zeigt sein Schild.
function Stueck({ a, gesperrt, hoch, aktiv, onWaehlen, children, position, rotation }: {
  a: Ausstattung; gesperrt: boolean; hoch: number; aktiv: boolean; onWaehlen: (k: string | null) => void
  children: React.ReactNode; position: [number, number, number]; rotation?: [number, number, number]
}) {
  const [hover, setHover] = useState(false)
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (!g.current) return
    const ziel = hover || aktiv ? 1.03 : 1
    g.current.scale.lerp(new THREE.Vector3(ziel, ziel, ziel), Math.min(1, dt * 10))
  })
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = '' } }, [hover])
  const klick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 6) return; onWaehlen(aktiv ? null : a.key) }
  return (
    <group position={position} rotation={rotation}>
      <group ref={g} onClick={klick} onPointerOver={(e) => { e.stopPropagation(); setHover(true) }} onPointerOut={() => setHover(false)}>
        <GesperrtCtx.Provider value={gesperrt}>{gesperrt ? <Umriss>{children}</Umriss> : children}</GesperrtCtx.Provider>
      </group>
      {(hover || aktiv) && (
        <Html position={[0, hoch, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`st-schild ${gesperrt ? 'gesperrt' : ''} ${aktiv ? 'aktiv' : ''}`}>
            <strong>{a.name}</strong>
            {gesperrt && <small>ab Level {a.abLevel}</small>}
          </div>
        </Html>
      )}
    </group>
  )
}

// Gesperrt: alles halbdurchsichtig, kalt, ohne Schatten.
function Umriss({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useEffect(() => {
    g.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh
        m.castShadow = false; m.receiveShadow = false
        m.material = new THREE.MeshStandardMaterial({ color: '#9fb6ff', transparent: true, opacity: 0.14, roughness: 1, depthWrite: false })
      }
    })
  }, [])
  return <group ref={g}>{children}</group>
}

// ------------------------------------------------------------ Moebel
function Schreibtisch({ nacht, dringend, vorschlaege }: { nacht: boolean; dringend: number; vorschlaege: number }) {
  const schirm = dringend > 0 ? F.orange : vorschlaege > 0 ? F.blau : F.gruen
  return (
    <group>
      {/* Platte + Beine */}
      <Kasten p={[0, 0.74, 0]} s={[3.4, 0.08, 1.4]} mat={{ color: F.holzDunkel, roughness: .6 }} />
      {([[-1.55, -0.55], [1.55, -0.55], [-1.55, 0.55], [1.55, 0.55]] as const).map(([x, z], i) => (
        <Kasten key={i} p={[x, 0.36, z]} s={[0.08, 0.72, 0.08]} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} />
      ))}
      {/* Monitore */}
      {[-0.75, 0.75].map((x, i) => (
        <group key={i} position={[x, 0.78, -0.35]}>
          <Kasten p={[0, 0.12, 0]} s={[0.26, 0.04, 0.2]} mat={{ color: F.schwarz }} />
          <Kasten p={[0, 0.3, 0]} s={[0.05, 0.36, 0.05]} mat={{ color: F.schwarz }} />
          <Kasten p={[0, 0.72, 0]} s={[1.3, 0.76, 0.05]} r={0.02} mat={{ color: F.schwarz, roughness: .4 }} />
          <mesh position={[0, 0.72, 0.03]}>
            <planeGeometry args={[1.22, 0.68]} />
            <meshStandardMaterial color={schirm} emissive={schirm} emissiveIntensity={nacht ? 1.4 : 0.6} roughness={.3} />
          </mesh>
        </group>
      ))}
      {/* Tastatur, Maus, Laptop */}
      <Kasten p={[0, 0.8, 0.25]} s={[0.9, 0.03, 0.3]} mat={{ color: F.stahl, metalness: .3, roughness: .5 }} />
      <Kasten p={[0.65, 0.8, 0.25]} s={[0.12, 0.04, 0.18]} r={0.03} mat={{ color: F.weiss }} />
      <group position={[-1.3, 0.78, 0.15]} rotation={[0, 0.5, 0]}>
        <Kasten p={[0, 0.01, 0]} s={[0.62, 0.025, 0.42]} mat={{ color: F.stahl, metalness: .4, roughness: .4 }} />
        <Kasten p={[0, 0.22, -0.2]} s={[0.62, 0.42, 0.02]} rot={[-0.25, 0, 0]} mat={{ color: F.stahl, metalness: .4, roughness: .4 }} />
      </group>
      {/* Lampe */}
      <group position={[1.45, 0.78, -0.4]}>
        <Zylinder p={[0, 0.02, 0]} r={0.12} h={0.04} mat={{ color: F.schwarz }} />
        <Kasten p={[0, 0.3, 0]} s={[0.03, 0.56, 0.03]} mat={{ color: F.schwarz }} />
        <mesh position={[-0.2, 0.55, 0]} rotation={[0, 0, 0.9]} castShadow>
          <coneGeometry args={[0.16, 0.22, 20, 1, true]} />
          <meshStandardMaterial color={F.schwarz} side={THREE.DoubleSide} />
        </mesh>
        {nacht && <pointLight position={[-0.3, 0.42, 0]} intensity={1.6} distance={3} color="#ffd9a0" />}
      </group>
      {/* Stuhl */}
      <group position={[0.1, 0, 1.15]}>
        <Zylinder p={[0, 0.03, 0]} r={0.32} h={0.05} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} />
        <Kasten p={[0, 0.3, 0]} s={[0.06, 0.5, 0.06]} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} />
        <Kasten p={[0, 0.56, 0]} s={[0.56, 0.1, 0.56]} r={0.05} mat={{ color: F.orange, roughness: .9 }} />
        <Kasten p={[0, 0.92, 0.26]} s={[0.54, 0.64, 0.08]} r={0.04} rot={[-0.1, 0, 0]} mat={{ color: F.orange, roughness: .9 }} />
      </group>
    </group>
  )
}

function Ofen({ an, nacht }: { an: boolean; nacht: boolean }) {
  const feuer = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => { if (feuer.current) feuer.current.intensity = (an ? 2.4 : 0.6) + Math.sin(clock.elapsedTime * 9) * 0.25 + Math.sin(clock.elapsedTime * 23) * 0.15 })
  return (
    <group>
      <Kasten p={[0, 0.6, 0]} s={[2.0, 1.2, 1.5]} r={0.05} mat={{ color: F.ziegel, roughness: 1 }} />
      {/* Fugenlinien */}
      {[0.25, 0.55, 0.85].map((y) => <Kasten key={y} p={[0, y, 0.76]} s={[2.0, 0.02, 0.01]} mat={{ color: F.ziegelFuge }} />)}
      <Kasten p={[0, 1.26, 0]} s={[2.1, 0.12, 1.6]} r={0.04} mat={{ color: F.schwarz, roughness: .6 }} />
      {/* Kuppel + Kamin */}
      <mesh position={[0, 1.32, -0.1]} castShadow>
        <sphereGeometry args={[0.72, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color={F.ziegel} roughness={1} />
      </mesh>
      <Zylinder p={[0.35, 2.2, -0.4]} r={0.12} h={1.5} mat={{ color: F.schwarz, metalness: .5, roughness: .5 }} />
      {/* Oeffnung mit Glut */}
      <mesh position={[0, 0.78, 0.76]}>
        <planeGeometry args={[0.9, 0.5]} />
        <meshStandardMaterial color={an ? '#ff7a2a' : '#3a1a10'} emissive={an ? '#ff6a1a' : '#2a0e06'} emissiveIntensity={an ? 2 : 0.4} />
      </mesh>
      <pointLight ref={feuer} position={[0, 0.8, 1.2]} distance={an ? 5 : 2.5} color="#ff8a3a" castShadow={false} />
      {/* Pizzaschieber */}
      <Kasten p={[1.2, 1.0, 0.5]} s={[0.05, 2.0, 0.05]} rot={[0, 0, -0.15]} mat={{ color: F.holzDunkel }} />
      <Kasten p={[1.36, 2.0, 0.5]} s={[0.3, 0.26, 0.02]} rot={[0, 0, -0.15]} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} />
      {an && <Rauch nacht={nacht} />}
    </group>
  )
}

function Rauch({ nacht }: { nacht: boolean }) {
  const refs = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return
      const t = (clock.elapsedTime * 0.35 + i / 4) % 1
      m.position.set(0.35 + Math.sin(t * 6 + i) * 0.1, 2.95 + t * 1.6, -0.4)
      const s = 0.08 + t * 0.22; m.scale.set(s, s, s)
      ;(m.material as THREE.MeshStandardMaterial).opacity = (1 - t) * (nacht ? 0.35 : 0.5)
    })
  })
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(el) => { if (el) refs.current[i] = el }}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#d9d9e0" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

function Kalender({ nacht }: { nacht: boolean }) {
  const felder = useMemo(() => Array.from({ length: 35 }, (_, i) => ({ an: (i * 7) % 5 === 0 || (i * 3) % 7 === 1, farbe: [F.orange, F.blau, F.gruen][i % 3] })), [])
  return (
    <group>
      <Kasten p={[0, 0, 0]} s={[1.8, 1.3, 0.04]} r={0.02} mat={{ color: F.weiss, roughness: .9 }} />
      <Kasten p={[0, 0.56, 0.025]} s={[1.8, 0.16, 0.01]} mat={{ color: F.orange }} />
      {felder.map((f, i) => {
        const sp = i % 7, z = Math.floor(i / 7)
        return (
          <mesh key={i} position={[-0.72 + sp * 0.24, 0.36 - z * 0.2, 0.03]}>
            <planeGeometry args={[0.2, 0.15]} />
            <meshStandardMaterial color={f.an ? f.farbe : '#e3ddd3'} emissive={f.an ? f.farbe : '#000'} emissiveIntensity={f.an ? (nacht ? .5 : .15) : 0} />
          </mesh>
        )
      })}
    </group>
  )
}

function Pinnwand({ zettel }: { zettel: number }) {
  const farben = [F.gold, '#ffb3c7', F.blau, '#c7f2d4', F.gold, '#ffb3c7']
  const n = Math.min(6, Math.max(1, zettel))
  return (
    <group>
      <Kasten p={[0, 0, 0]} s={[1.8, 1.3, 0.05]} r={0.02} mat={{ color: F.eiche, roughness: 1 }} />
      <Kasten p={[0, 0, 0.01]} s={[1.66, 1.16, 0.04]} mat={{ color: F.kork, roughness: 1 }} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[-0.55 + (i % 3) * 0.55, 0.28 - Math.floor(i / 3) * 0.55, 0.04]} rotation={[0, 0, ((i * 37) % 10 - 5) * 0.03]}>
          <Kasten p={[0, 0, 0]} s={[0.4, 0.4, 0.015]} r={0.005} mat={{ color: farben[i] }} />
          <Zylinder p={[0, 0.16, 0.02]} r={0.025} h={0.02} mat={{ color: F.rot, roughness: .4 }} seg={12} />
        </group>
      ))}
    </group>
  )
}

function Kundenwand({ kunden }: { kunden: StudioLeben['kunden'] }) {
  const n = Math.max(1, Math.min(9, kunden.length))
  const spalten = n <= 4 ? 2 : 3
  const groesse = spalten === 2 ? 0.7 : 0.5, luecke = 0.1
  const breite = spalten * groesse + (spalten - 1) * luecke
  const zeilen = Math.ceil(n / spalten)
  const hoehe = zeilen * groesse + (zeilen - 1) * luecke
  const palette = ['#ff5f1f', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff375f', '#64d2ff', '#ff9f0a', '#5e5ce6']
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const k = kunden[i]
        const sp = i % spalten, z = Math.floor(i / spalten)
        const x = -breite / 2 + groesse / 2 + sp * (groesse + luecke)
        const y = hoehe / 2 - groesse / 2 - z * (groesse + luecke)
        const farbe = k?.farbe || palette[i % palette.length]
        return (
          <group key={k?.id ?? i} position={[x, y, 0]}>
            <Kasten p={[0, 0, 0]} s={[groesse, groesse, 0.05]} r={0.01} mat={{ color: F.schwarz, roughness: .5 }} />
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[groesse - 0.1, groesse - 0.1]} />
              <meshStandardMaterial color={farbe} emissive={farbe} emissiveIntensity={0.25} roughness={.6} />
            </mesh>
            {k?.gruen && <Zylinder p={[groesse / 2 - 0.08, -groesse / 2 + 0.08, 0.05]} r={0.05} h={0.02} mat={{ color: F.gruen, emissive: F.gruen, emissiveIntensity: .8 }} seg={12} />}
          </group>
        )
      })}
    </group>
  )
}

function Aktenschrank({ voll }: { voll: number }) {
  return (
    <group>
      <Kasten p={[0, 0.95, 0]} s={[0.9, 1.9, 1.4]} r={0.03} mat={{ color: F.grau, roughness: .5, metalness: .2 }} />
      {[0.35, 0.8, 1.25, 1.7].map((y, i) => (
        <group key={y}>
          <Kasten p={[0.46, y, 0]} s={[0.02, 0.4, 1.3]} mat={{ color: i < Math.ceil(voll / 3) ? F.orange : '#6c7784', roughness: .5 }} />
          <Kasten p={[0.49, y, 0]} s={[0.03, 0.05, 0.3]} mat={{ color: F.stahl, metalness: .6, roughness: .3 }} />
        </group>
      ))}
    </group>
  )
}

function Pflanze() {
  const blaetter = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2 + 0.3, h: 0.6 + (i % 3) * 0.35, l: 0.45 + (i % 2) * 0.2 })), [])
  return (
    <group>
      <Zylinder p={[0, 0.3, 0]} r={[0.36, 0.28]} h={0.6} mat={{ color: F.topf, roughness: 1 }} />
      <Zylinder p={[0, 0.6, 0]} r={0.33} h={0.04} mat={{ color: '#3b2a1e' }} />
      {blaetter.map((b, i) => (
        <group key={i} rotation={[0, b.a, 0]}>
          <Kasten p={[0.12, 0.6 + b.h / 2, 0]} s={[0.03, b.h, 0.03]} rot={[0, 0, -0.35]} mat={{ color: F.pflanzeDunkel }} />
          <mesh position={[0.35, 0.65 + b.h, 0]} rotation={[0.3, 0, -0.6]} castShadow>
            <sphereGeometry args={[b.l * 0.5, 12, 8]} />
            <meshStandardMaterial color={i % 2 ? F.pflanze : F.pflanzeDunkel} roughness={.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Kasse({ nacht }: { nacht: boolean }) {
  return (
    <group>
      <Kasten p={[0, 0.5, 0]} s={[1.4, 1.0, 0.8]} r={0.04} mat={{ color: F.eiche, roughness: .7 }} />
      <Kasten p={[0, 1.02, 0]} s={[1.5, 0.06, 0.9]} r={0.02} mat={{ color: F.weiss, roughness: .4 }} />
      <Kasten p={[0.2, 1.2, -0.05]} s={[0.6, 0.3, 0.5]} r={0.04} mat={{ color: F.schwarz, roughness: .4 }} />
      <mesh position={[0.2, 1.42, 0.05]} rotation={[-0.6, 0, 0]}>
        <planeGeometry args={[0.45, 0.26]} />
        <meshStandardMaterial color={F.gruen} emissive={F.gruen} emissiveIntensity={nacht ? 1.2 : .5} />
      </mesh>
      {/* Muenzstapel */}
      {[[-0.45, 0.1], [-0.3, -0.15], [-0.5, -0.2]].map(([x, z], i) => (
        <Zylinder key={i} p={[x, 1.1 + i * 0.015, z]} r={0.09} h={0.08 + i * 0.03} mat={{ color: F.gold, metalness: .8, roughness: .3 }} seg={18} />
      ))}
    </group>
  )
}

function Kaffee({ nacht }: { nacht: boolean }) {
  return (
    <group>
      <Kasten p={[0, 0.45, 0]} s={[1.6, 0.9, 0.6]} r={0.03} mat={{ color: F.weiss, roughness: .6 }} />
      <Kasten p={[0, 0.91, 0]} s={[1.7, 0.05, 0.7]} r={0.02} mat={{ color: F.holzDunkel, roughness: .6 }} />
      {/* Maschine */}
      <Kasten p={[-0.35, 1.2, -0.05]} s={[0.5, 0.5, 0.4]} r={0.04} mat={{ color: F.schwarz, roughness: .35, metalness: .3 }} />
      <Kasten p={[-0.35, 1.0, 0.12]} s={[0.4, 0.08, 0.15]} mat={{ color: F.stahl, metalness: .7, roughness: .3 }} />
      <mesh position={[-0.35, 1.3, 0.16]}>
        <planeGeometry args={[0.16, 0.06]} />
        <meshStandardMaterial color={F.blau} emissive={F.blau} emissiveIntensity={nacht ? 1.5 : .6} />
      </mesh>
      {/* Tassen */}
      {[0.25, 0.5].map((x, i) => <Zylinder key={i} p={[x, 1.0, 0.05]} r={[0.07, 0.06]} h={0.12} mat={{ color: i ? F.orange : F.weiss, roughness: .5 }} seg={14} />)}
    </group>
  )
}

function Neon({ nacht }: { nacht: boolean }) {
  const gesperrt = useContext(GesperrtCtx)
  return (
    <group>
      <Html transform position={[0, 0, 0.02]} distanceFactor={6} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`st-neon ${nacht ? 'nacht' : ''} ${gesperrt ? 'aus' : ''}`}>S&amp;L<small>media</small></div>
      </Html>
      {nacht && !gesperrt && <pointLight position={[0, 0, 0.6]} intensity={2.2} distance={4} color={F.orange} />}
      {/* Klickflaeche (unsichtbar) */}
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[2.2, 1.0]} /><meshStandardMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>
  )
}

function Pokale({ anzahl }: { anzahl: number }) {
  const gesperrt = useContext(GesperrtCtx)
  const n = Math.min(6, anzahl)
  return (
    <group>
      <Kasten p={[0, 0, 0]} s={[1.6, 0.05, 0.3]} r={0.01} mat={{ color: F.holzDunkel, roughness: .6 }} />
      <Kasten p={[0, -0.12, -0.12]} s={[1.5, 0.2, 0.03]} mat={{ color: F.holzDunkel, roughness: .6 }} />
      {Array.from({ length: Math.max(n, 0) }, (_, i) => (
        <group key={i} position={[-0.65 + i * 0.26, 0.03, 0]}>
          <Zylinder p={[0, 0.03, 0]} r={0.07} h={0.05} mat={{ color: F.schwarz }} seg={12} />
          <Zylinder p={[0, 0.1, 0]} r={0.02} h={0.1} mat={{ color: F.gold, metalness: .9, roughness: .25 }} seg={10} />
          <Zylinder p={[0, 0.22, 0]} r={[0.08, 0.04]} h={0.16} mat={{ color: F.gold, metalness: .9, roughness: .25 }} seg={14} />
        </group>
      ))}
      {n === 0 && !gesperrt && <Html position={[0, 0.2, 0]} center style={{ pointerEvents: 'none' }}><div className="st-leer">noch kein Hit</div></Html>}
    </group>
  )
}

function Sofa() {
  return (
    <group>
      <Kasten p={[0, 0.25, 0]} s={[0.9, 0.3, 2.2]} r={0.08} mat={{ color: F.sofa, roughness: 1 }} />
      <Kasten p={[0, 0.5, 0]} s={[0.8, 0.2, 2.0]} r={0.08} mat={{ color: '#4a6d7e', roughness: 1 }} />
      <Kasten p={[0.35, 0.7, 0]} s={[0.2, 0.7, 2.2]} r={0.08} mat={{ color: F.sofa, roughness: 1 }} />
      <Kasten p={[0, 0.6, 1.0]} s={[0.9, 0.5, 0.2]} r={0.08} mat={{ color: F.sofa, roughness: 1 }} />
      <Kasten p={[0, 0.6, -1.0]} s={[0.9, 0.5, 0.2]} r={0.08} mat={{ color: F.sofa, roughness: 1 }} />
      <Kasten p={[-0.1, 0.72, 0.4]} s={[0.35, 0.3, 0.35]} r={0.08} rot={[0, 0.3, 0]} mat={{ color: F.orange, roughness: 1 }} />
      {/* Beistelltisch */}
      <Zylinder p={[-1.1, 0.22, 0]} r={0.35} h={0.04} mat={{ color: F.holzDunkel, roughness: .6 }} />
      <Zylinder p={[-1.1, 0.1, 0]} r={0.04} h={0.2} mat={{ color: F.schwarz }} />
    </group>
  )
}

function Tisch2() {
  return (
    <group>
      <Kasten p={[0, 0.74, 0]} s={[2.0, 0.07, 1.0]} mat={{ color: F.weiss, roughness: .6 }} />
      {([[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]] as const).map(([x, z], i) => (
        <Kasten key={i} p={[x, 0.36, z]} s={[0.07, 0.72, 0.07]} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} />
      ))}
      <group position={[0, 0.78, -0.2]}>
        <Kasten p={[0, 0.1, 0]} s={[0.2, 0.03, 0.16]} mat={{ color: F.schwarz }} />
        <Kasten p={[0, 0.5, 0]} s={[1.0, 0.6, 0.04]} r={0.02} mat={{ color: F.schwarz, roughness: .4 }} />
      </group>
      <group position={[0, 0, 0.9]}>
        <Zylinder p={[0, 0.03, 0]} r={0.3} h={0.05} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} />
        <Kasten p={[0, 0.3, 0]} s={[0.06, 0.5, 0.06]} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} />
        <Kasten p={[0, 0.56, 0]} s={[0.52, 0.1, 0.52]} r={0.05} mat={{ color: F.blau, roughness: .9 }} />
        <Kasten p={[0, 0.9, 0.24]} s={[0.5, 0.6, 0.08]} r={0.04} mat={{ color: F.blau, roughness: .9 }} />
      </group>
    </group>
  )
}

function Konferenz() {
  return (
    <group>
      <Zylinder p={[0, 0.74, 0]} r={1.0} h={0.07} mat={{ color: F.holzDunkel, roughness: .6 }} seg={32} />
      <Zylinder p={[0, 0.37, 0]} r={0.12} h={0.72} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} />
      <Zylinder p={[0, 0.03, 0]} r={0.5} h={0.05} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} seg={32} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <group key={i} position={[Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35]}>
            <Zylinder p={[0, 0.25, 0]} r={0.05} h={0.5} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} seg={10} />
            <Zylinder p={[0, 0.52, 0]} r={0.26} h={0.08} mat={{ color: i % 2 ? F.orange : F.weiss, roughness: .9 }} seg={20} />
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------- Raum
function Raum({ nacht }: { nacht: boolean }) {
  const holz = useMemo(holzTextur, [])
  const fenster = useMemo(() => fensterTextur(nacht), [nacht])
  return (
    <group>
      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[R * 2, R * 2]} />
        <meshStandardMaterial map={holz} roughness={.75} />
      </mesh>
      {/* Sockel unter dem Boden, damit der Raum "steht" */}
      <Kasten p={[0, -0.29, 0]} s={[R * 2 + 0.3, 0.5, R * 2 + 0.3]} r={0.05} mat={{ color: F.leiste, roughness: .9 }} />
      {/* Rueckwand + linke Wand */}
      <Kasten p={[0, 2.25, -R - 0.15]} s={[R * 2 + 0.3, 4.5, 0.3]} r={0.02} mat={{ color: F.wand, roughness: .95 }} />
      <Kasten p={[-R - 0.15, 2.25, 0]} s={[0.3, 4.5, R * 2 + 0.3]} r={0.02} mat={{ color: F.wandHell, roughness: .95 }} />
      {/* Fussleisten */}
      <Kasten p={[0, 0.08, -R + 0.03]} s={[R * 2, 0.16, 0.06]} mat={{ color: F.leiste }} />
      <Kasten p={[-R + 0.03, 0.08, 0]} s={[0.06, 0.16, R * 2]} mat={{ color: F.leiste }} />
      {/* Teppich */}
      <group position={[-1.5, 0.011, -2.0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[5.2, 4.2]} /><meshStandardMaterial color={F.teppichRand} roughness={1} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow><planeGeometry args={[4.8, 3.8]} /><meshStandardMaterial color={F.teppich} roughness={1} /></mesh>
      </group>
      {/* Fenster in der Rueckwand */}
      <group position={[-3.4, 2.6, -R + 0.01]}>
        <Kasten p={[0, 0, 0]} s={[2.8, 2.1, 0.12]} r={0.02} mat={{ color: F.weiss, roughness: .6 }} />
        <mesh position={[0, 0, 0.07]}>
          <planeGeometry args={[2.5, 1.8]} />
          <meshStandardMaterial map={fenster} emissiveMap={fenster} emissive="#ffffff" emissiveIntensity={nacht ? .9 : 1.1} roughness={.2} />
        </mesh>
        <Kasten p={[0, 0, 0.1]} s={[0.05, 1.8, 0.03]} mat={{ color: F.weiss }} />
        <Kasten p={[0, 0, 0.1]} s={[2.5, 0.05, 0.03]} mat={{ color: F.weiss }} />
        <Kasten p={[0, -1.1, 0.12]} s={[3.0, 0.08, 0.3]} r={0.02} mat={{ color: F.weiss, roughness: .6 }} />
        {nacht ? <pointLight position={[0, 0, 1.2]} intensity={1.2} distance={6} color="#8aa5ff" /> : <pointLight position={[0, 0, 1.5]} intensity={2.5} distance={8} color="#ffe9c9" />}
      </group>
      {/* Deckenlampen (Pendel) */}
      {[[-1.5, -2.2], [2.5, 1.0]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Kasten p={[0, 4.0, 0]} s={[0.02, 1.0, 0.02]} mat={{ color: F.schwarz }} />
          <mesh position={[0, 3.4, 0]} castShadow>
            <coneGeometry args={[0.45, 0.35, 28, 1, true]} />
            <meshStandardMaterial color={F.schwarz} side={THREE.DoubleSide} roughness={.5} />
          </mesh>
          <mesh position={[0, 3.3, 0]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshStandardMaterial color="#fff2d6" emissive="#ffd9a0" emissiveIntensity={nacht ? 2.5 : 1} />
          </mesh>
          {nacht && <pointLight position={[0, 3.1, 0]} intensity={3} distance={7} decay={2} color="#ffd9a0" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.002} />}
        </group>
      ))}
    </group>
  )
}

// ------------------------------------------------------ Kamera & Licht
function Kamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    const basis = Math.min(size.width / 16.2, size.height / 13.6)
    cam.zoom = Math.max(24, basis)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Licht({ nacht }: { nacht: boolean }) {
  return (
    <>
      <hemisphereLight args={[nacht ? '#4a5a9a' : '#e4ecff', nacht ? '#1a1410' : '#7a5a3a', nacht ? .35 : 1.25]} />
      <ambientLight intensity={nacht ? .12 : .5} />
      <directionalLight
        position={[5, 10, 6]} intensity={nacht ? .25 : 2.0} color={nacht ? '#9fb0ff' : '#fff1d6'} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.05}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-camera-near={1} shadow-camera-far={30}
      />
      <directionalLight position={[-8, 6, 6]} intensity={nacht ? .1 : .6} color="#ffd9b0" />
    </>
  )
}

// ---------------------------------------------------------------- Szene
function Szene(p: StudioProps) {
  const { level, nacht, leben, offeneQuests, hits, gewaehlt, onWaehlen } = p
  const a = useMemo(() => Object.fromEntries(AUSSTATTUNG.map((x) => [x.key, x])) as Record<string, Ausstattung>, [])
  const frei = (k: string) => a[k].abLevel <= level.nr
  const st = (key: string, position: [number, number, number], hoch: number, kind: React.ReactNode, rotation?: [number, number, number]) => (
    <Stueck a={a[key]} gesperrt={!frei(key)} hoch={hoch} aktiv={gewaehlt === key} onWaehlen={onWaehlen} position={position} rotation={rotation}>{kind}</Stueck>
  )
  return (
    <>
      <Kamera />
      <Licht nacht={nacht} />
      <Raum nacht={nacht} />
      {/* Boden */}
      {st('schreibtisch', [-1.6, 0, -3.3], 2.2, <Schreibtisch nacht={nacht} dringend={leben.dringend} vorschlaege={leben.vorschlaege} />)}
      {st('ofen', [4.1, 0, -4.5], 3.2, <Ofen an={leben.imOfen > 0} nacht={nacht} />)}
      {st('kaffee', [1.3, 0, -5.1], 2.0, <Kaffee nacht={nacht} />)}
      {st('pflanze', [-4.8, 0, -4.7], 2.4, <Pflanze />)}
      {st('aktenschrank', [-4.95, 0, 3.4], 2.4, <Aktenschrank voll={leben.dokumente} />)}
      {st('kasse', [4.3, 0, -0.6], 2.0, <Kasse nacht={nacht} />, [0, -Math.PI / 2, 0])}
      {st('tisch2', [-1.6, 0, 0.9], 1.9, <Tisch2 />)}
      {st('sofa', [4.6, 0, 2.9], 1.6, <Sofa />)}
      {st('konferenz', [1.0, 0, 3.2], 1.6, <Konferenz />)}
      {/* Rueckwand */}
      {st('kalender', [-0.3, 2.6, -R + 0.03], 1.0, <Kalender nacht={nacht} />)}
      {st('neon', [2.2, 3.4, -R + 0.02], 0.9, <Neon nacht={nacht} />)}
      {/* Linke Wand */}
      {st('kundenwand', [-R + 0.04, 2.6, -2.9], 1.3, <Kundenwand kunden={leben.kunden} />, [0, Math.PI / 2, 0])}
      {st('pokale', [-R + 0.2, 1.9, -0.2], 0.7, <Pokale anzahl={hits} />, [0, Math.PI / 2, 0])}
      {st('pinnwand', [-R + 0.04, 2.5, 1.8], 1.0, <Pinnwand zettel={offeneQuests} />, [0, Math.PI / 2, 0])}
      <OrbitControls
        makeDefault enablePan={false} enableDamping dampingFactor={0.08} target={[-0.2, 1.35, -0.6]}
        minPolarAngle={0.5} maxPolarAngle={1.2} minAzimuthAngle={0.2} maxAzimuthAngle={1.35}
        minZoom={22} maxZoom={110} zoomSpeed={0.6} rotateSpeed={0.6}
      />
    </>
  )
}

export default function Studio(p: StudioProps) {
  return (
    <div className="st-buehne">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        orthographic
        camera={{ position: [11, 9.5, 11], zoom: 50, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: p.nacht ? 1.0 : 1.2 }}
        onPointerMissed={() => p.onWaehlen(null)}
      >
        <color attach="background" args={[p.nacht ? '#0b0f2a' : '#101a33']} />
        <Suspense fallback={null}>
          <Szene {...p} />
        </Suspense>
      </Canvas>
    </div>
  )
}
