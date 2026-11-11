// Die Welt -- zwei Ansichten auf dieselbe echte Agentur (Fassie, 11.11.2026):
//
//   Block: das Dashboard "von aussen". Die Agentur steht in der Mitte, jeder
//          Kunde ist ein kleiner Laden drumherum mit seinem Monatsstand.
//          Ein freies Grundstueck wartet auf den naechsten Kunden.
//   Haus:  Tipp auf die Agentur -> das Haus im Querschnitt. Jede Etage ist ein
//          Raum, jedes Moebelstueck ein Knopf ins CRM. Die naechste Etage ist
//          Baustelle, bis ihre echte Bedingung stimmt.
//
// Am Handy Hochformat (Laeden in zwei Spalten, Haus zum Hochwischen), am PC
// Querformat (Laeden in der Breite). Alles aus einfachen Koerpern, keine
// Modelle, kein Download.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { AUSSTATTUNG, type Ausstattung, type EtageStand, type Level } from '../lib/spiel'
import type { StudioKunde, StudioLeben } from './daten'
import {
  F, Mat, Kasten, Zylinder, Stueck, Figur, Schreibtisch, Ofen, Kalender, Pinnwand, Aktenschrank, Pflanze, Kasse, Kaffee,
  Neon, Pokale, Sofa, Tisch2, Konferenz, CafeTisch,
} from './Studio'

export type Ansicht = 'block' | 'haus'

export interface WeltProps {
  ansicht: Ansicht
  onAnsicht: (a: Ansicht) => void
  etagen: EtageStand[]
  level: Level
  nacht: boolean
  leben: StudioLeben
  offeneQuests: number
  hits: number
  gewaehlt: string | null
  onWaehlen: (key: string | null) => void
  /** Tipp aufs freie Grundstueck: neuen Kunden eintragen */
  onFrei: () => void
}

const PALETTE = ['#ff5f1f', '#0a84ff', '#30d158', '#ffd60a', '#bf5af2', '#ff375f', '#64d2ff', '#ff9f0a', '#5e5ce6']
const K = Math.SQRT1_2

/** Bildschirm-Raster -> Welt: u = nach rechts, v = nach vorn (zum Betrachter). */
function uv(u: number, v: number, y = 0): [number, number, number] {
  return [(u + v) * K, y, (v - u) * K]
}

/** Kurzname fuers Schild ueber dem Laden: "Fahrschule Hajo" -> "Hajo". */
export function kurzName(name: string): string {
  const w = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean)
  const fuell = ['fahrschule', 'das', 'die', 'der', 'restaurant', 'café', 'cafe']
  const erstes = w.find((x) => !fuell.includes(x.toLowerCase())) ?? w[0] ?? name
  return erstes.length > 13 ? erstes.slice(0, 12) + '…' : erstes
}

function useKlick(fn: () => void) {
  const [hover, setHover] = useState(false)
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; return () => { document.body.style.cursor = '' } }, [hover])
  return {
    hover,
    griff: {
      onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta > 6) return; fn() },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true) },
      onPointerOut: () => setHover(false),
    },
  }
}

// =================================================================== BLOCK

/** Was vor dem Laden steht -- aus dem Namen geraten, damit man ihn erkennt. */
function Requisit({ name, farbe }: { name: string; farbe: string }) {
  const n = name.toLowerCase()
  if (n.includes('fahrschul')) {
    // kleines Auto mit L-Schild
    return (
      <group position={[0.2, 0, 1.75]}>
        <Kasten p={[0, 0.28, 0]} s={[1.1, 0.3, 0.55]} r={0.08} mat={{ color: farbe, roughness: .5 }} />
        <Kasten p={[-0.05, 0.52, 0]} s={[0.6, 0.24, 0.5]} r={0.08} mat={{ color: '#dfe9f5', roughness: .3 }} />
        {([[-0.35, 0.28], [0.35, 0.28], [-0.35, -0.28], [0.35, -0.28]] as const).map(([x, z], i) => (
          <mesh key={i} position={[x, 0.14, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.08, 12]} /><Mat color={F.schwarz} /></mesh>
        ))}
        <Kasten p={[-0.05, 0.72, 0]} s={[0.22, 0.16, 0.22]} r={0.02} mat={{ color: F.weiss, emissive: '#ffffff', emissiveIntensity: .3 }} />
      </group>
    )
  }
  if (n.includes('kebab') || n.includes('döner') || n.includes('doner') || n.includes('chicken') || n.includes('burger')) {
    // Drehspiess
    return (
      <group position={[0.75, 0, 1.45]}>
        <Zylinder p={[0, 0.04, 0]} r={0.22} h={0.08} mat={{ color: F.stahl, metalness: .6, roughness: .3 }} seg={14} />
        <Zylinder p={[0, 0.6, 0]} r={0.025} h={1.1} mat={{ color: F.stahl, metalness: .6, roughness: .3 }} seg={8} />
        <Zylinder p={[0, 0.6, 0]} r={[0.2, 0.13]} h={0.7} mat={{ color: '#9c5a2c', roughness: .9 }} seg={14} />
      </group>
    )
  }
  if (n.includes('schleck') || n.includes('eis')) {
    // Eiswaffel
    return (
      <group position={[0.8, 0, 1.45]}>
        <mesh position={[0, 0.45, 0]} rotation={[Math.PI, 0, 0]} castShadow><coneGeometry args={[0.2, 0.7, 14]} /><Mat color="#d9a45c" roughness={.8} /></mesh>
        <mesh position={[0, 0.9, 0]} castShadow><sphereGeometry args={[0.22, 14, 12]} /><Mat color={farbe} roughness={.6} /></mesh>
        <mesh position={[0.05, 1.18, 0]} castShadow><sphereGeometry args={[0.17, 14, 12]} /><Mat color={F.weiss} roughness={.6} /></mesh>
      </group>
    )
  }
  if (n.includes('kraft') || n.includes('gym') || n.includes('fit') || n.includes('act')) {
    // Hantel
    return (
      <group position={[0.7, 0.2, 1.5]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.8, 8]} /><Mat color={F.stahl} metalness={.6} roughness={.3} /></mesh>
        {[-0.38, 0.38].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.14, 14]} /><Mat color={F.schwarz} roughness={.6} /></mesh>
        ))}
      </group>
    )
  }
  if (n.includes('licht')) {
    // Laterne
    return (
      <group position={[0.85, 0, 1.45]}>
        <Zylinder p={[0, 0.55, 0]} r={0.03} h={1.1} mat={{ color: F.schwarz }} seg={8} />
        <mesh position={[0, 1.2, 0]}><sphereGeometry args={[0.17, 14, 12]} /><Mat color="#fff2c9" emissive="#ffd87a" emissiveIntensity={1.6} /></mesh>
      </group>
    )
  }
  return <group position={[0.85, 0, 1.45]}><Zylinder p={[0, 0.18, 0]} r={[0.16, 0.12]} h={0.36} mat={{ color: F.topf, roughness: 1 }} seg={12} /><mesh position={[0, 0.55, 0]} castShadow><sphereGeometry args={[0.26, 12, 10]} /><Mat color={F.pflanze} roughness={.9} /></mesh></group>
}

function Laden({ k, i, position, aktiv, nacht, onWaehlen }: { k: StudioKunde; i: number; position: [number, number, number]; aktiv: boolean; nacht: boolean; onWaehlen: (key: string | null) => void }) {
  const farbe = k.farbe || PALETTE[i % PALETTE.length]
  const { hover, griff } = useKlick(() => onWaehlen(aktiv ? null : `kunde:${k.id}`))
  const g = useRef<THREE.Group>(null)
  const ruf = useRef<THREE.Group>(null)
  useFrame(({ clock }, dt) => {
    if (g.current) { const z = hover || aktiv ? 1.06 : 1; g.current.scale.lerp(new THREE.Vector3(z, z, z), Math.min(1, dt * 10)) }
    if (ruf.current) ruf.current.position.y = 3.0 + Math.abs(Math.sin(clock.elapsedTime * 4 + i)) * 0.25
  })
  const anteil = k.ziel > 0 ? Math.min(1, k.gepostet / k.ziel) : 1
  const fensterAn = nacht ? 1.3 : 0.35
  return (
    <group position={position}>
      <group ref={g} {...griff}>
        {/* Sockel */}
        <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: '#cfc6b8', roughness: 1 }} />
        {/* Haus */}
        <Kasten p={[0, 0.9, -0.1]} s={[2.3, 1.6, 2.1]} r={0.06} mat={{ color: '#f3ece0', roughness: .9 }} />
        {/* Dach in Kundenfarbe */}
        <Kasten p={[0, 1.78, -0.1]} s={[2.5, 0.2, 2.3]} r={0.05} mat={{ color: farbe, roughness: .7 }} />
        <Kasten p={[0.5, 2.0, -0.5]} s={[0.5, 0.3, 0.5]} r={0.04} mat={{ color: '#d8d0c2', roughness: 1 }} />
        {/* Markise vorn (+z) */}
        <Kasten p={[0, 1.28, 1.15]} s={[2.3, 0.1, 0.55]} r={0.03} rot={[0.28, 0, 0]} mat={{ color: farbe, roughness: .8 }} />
        {/* Tuer und Schaufenster vorn */}
        <Kasten p={[-0.65, 0.55, 0.96]} s={[0.5, 0.9, 0.04]} r={0.02} mat={{ color: '#3b2a1e', roughness: .6 }} />
        <mesh position={[0.4, 0.68, 0.965]}><planeGeometry args={[1.1, 0.7]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={fensterAn} roughness={.3} /></mesh>
        {/* Fenster rechts (+x) */}
        <mesh position={[1.155, 0.95, -0.1]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.3, 0.6]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={fensterAn} roughness={.3} /></mesh>
        {/* Schildband rechts in Kundenfarbe */}
        <Kasten p={[1.16, 1.5, -0.1]} s={[0.03, 0.22, 1.9]} mat={{ color: farbe, emissive: farbe, emissiveIntensity: nacht ? .6 : .1 }} />
        <Requisit name={k.name} farbe={farbe} />
        {/* Tippflaeche */}
        <mesh position={[0, 1.1, 0]}><boxGeometry args={[3, 2.4, 3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
      {k.ampel === 'rot' && (
        <group ref={ruf} position={[0, 3.0, 0]}>
          <Kasten p={[0, 0.12, 0]} s={[0.12, 0.36, 0.12]} r={0.05} mat={{ color: F.orange, emissive: F.orange, emissiveIntensity: 1.4 }} />
          <mesh position={[0, -0.18, 0]}><sphereGeometry args={[0.075, 10, 8]} /><Mat color={F.orange} emissive={F.orange} emissiveIntensity={1.4} /></mesh>
        </group>
      )}
      <Html position={[0, 2.35, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`wl-chip ${k.ampel} ${aktiv ? 'aktiv' : ''} ${k.gruen ? 'fertig' : ''}`}>
          <i style={{ background: `conic-gradient(currentColor ${Math.round(anteil * 360)}deg, rgba(255,255,255,.18) 0)` }} />
          <span>{kurzName(k.name)}</span>
          <b>{k.ziel > 0 ? `${k.gepostet}/${k.ziel}` : k.gepostet}</b>
        </div>
      </Html>
    </group>
  )
}

function FreiesGrundstueck({ position, onFrei }: { position: [number, number, number]; onFrei: () => void }) {
  const { hover, griff } = useKlick(onFrei)
  return (
    <group position={position} {...griff}>
      <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: hover ? '#8fd6a0' : '#79b98a', roughness: 1 }} />
      {/* Pfosten + Schild */}
      <Kasten p={[0, 0.6, 0.4]} s={[0.08, 1.0, 0.08]} mat={{ color: F.eiche }} />
      <Kasten p={[0, 1.15, 0.4]} s={[1.3, 0.55, 0.06]} r={0.03} mat={{ color: F.weiss, roughness: .8 }} />
      <Kasten p={[0, 1.36, 0.44]} s={[1.3, 0.12, 0.02]} mat={{ color: F.orange }} />
      <mesh position={[0, 0.7, 0]}><boxGeometry args={[3, 1.6, 3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      <Html position={[0, 2.0, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
        <div className="wl-chip frei"><span>Nächster Kunde</span><b>+</b></div>
      </Html>
    </group>
  )
}

function Baum({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <Zylinder p={[0, 0.35, 0]} r={[0.07, 0.1]} h={0.7} mat={{ color: F.eiche, roughness: 1 }} seg={8} />
      <mesh position={[0, 1.0, 0]} castShadow><sphereGeometry args={[0.5, 12, 10]} /><Mat color={F.pflanze} roughness={.9} /></mesh>
      <mesh position={[0.2, 1.35, 0.1]} castShadow><sphereGeometry args={[0.34, 12, 10]} /><Mat color={F.pflanzeDunkel} roughness={.9} /></mesh>
    </group>
  )
}

function Laterne({ position, nacht }: { position: [number, number, number]; nacht: boolean }) {
  return (
    <group position={position}>
      <Zylinder p={[0, 0.8, 0]} r={0.035} h={1.6} mat={{ color: F.schwarz, metalness: .4, roughness: .5 }} seg={8} />
      <mesh position={[0, 1.66, 0]}><sphereGeometry args={[0.13, 12, 10]} /><Mat color="#fff2c9" emissive="#ffd87a" emissiveIntensity={nacht ? 2.2 : .3} /></mesh>
      {nacht && <pointLight position={[0, 1.6, 0]} intensity={2.2} distance={6} decay={2} color="#ffd9a0" />}
    </group>
  )
}

const ETAGE_H = 1.05 // Hoehe einer Etage am kleinen Haus im Block

/** Die Agentur von aussen: so viele Etagen, wie wirklich stehen -- plus Baugeruest fuer die naechste. */
function Zentrale({ etagen, level, nacht, onRein }: { etagen: EtageStand[]; level: Level; nacht: boolean; onRein: () => void }) {
  const { hover, griff } = useKlick(onRein)
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (g.current) { const z = hover ? 1.04 : 1; g.current.scale.lerp(new THREE.Vector3(z, z, z), Math.min(1, dt * 10)) } })
  const stehen = etagen.filter((e) => e.frei)
  const naechste = etagen.find((e) => !e.frei)
  const hoehe = 0.2 + stehen.length * ETAGE_H
  const B = 3.4
  return (
    <group>
      <group ref={g} {...griff}>
        <Kasten p={[0, 0.08, 0]} s={[B + 1.2, 0.16, B + 1.2]} r={0.05} mat={{ color: '#d9d1c4', roughness: 1 }} />
        {stehen.map((e, i) => {
          const y = 0.16 + i * ETAGE_H
          return (
            <group key={e.etage.key} position={[0, y, 0]}>
              <Kasten p={[0, ETAGE_H / 2, 0]} s={[B, ETAGE_H - 0.06, B]} r={0.05} mat={{ color: i === 0 ? '#f0e4d2' : '#eef0f4', roughness: .85 }} />
              {/* Band in Etagenfarbe */}
              <Kasten p={[0, ETAGE_H - 0.06, 0]} s={[B + 0.12, 0.1, B + 0.12]} r={0.03} mat={{ color: e.etage.farbe, roughness: .7 }} />
              {/* Fenster vorn (+z) und rechts (+x) */}
              {[-1, 0, 1].map((f) => (
                <group key={f}>
                  <mesh position={[f * 1.0, ETAGE_H / 2 - 0.04, B / 2 + 0.005]}><planeGeometry args={[0.62, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.4 : .3} roughness={.3} /></mesh>
                  <mesh position={[B / 2 + 0.005, ETAGE_H / 2 - 0.04, f * 1.0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.62, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.4 : .3} roughness={.3} /></mesh>
                </group>
              ))}
            </group>
          )
        })}
        {/* Markise ueber dem Cafe */}
        <Kasten p={[0, 0.9, B / 2 + 0.3]} s={[B, 0.1, 0.65]} r={0.03} rot={[0.3, 0, 0]} mat={{ color: F.orange, roughness: .8 }} />
        <Kasten p={[B / 2 + 0.3, 0.9, 0]} s={[0.65, 0.1, B]} r={0.03} rot={[0, 0, -0.3]} mat={{ color: F.orange, roughness: .8 }} />
        {/* Tuer */}
        <Kasten p={[0, 0.55, B / 2 + 0.01]} s={[0.6, 0.78, 0.04]} r={0.02} mat={{ color: '#3b2a1e', roughness: .6 }} />
        {/* Baugeruest fuer die naechste Etage */}
        {naechste && (
          <group position={[0, hoehe, 0]}>
            {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([x, z], i) => (
              <Kasten key={i} p={[x * (B / 2 - 0.05), ETAGE_H / 2, z * (B / 2 - 0.05)]} s={[0.07, ETAGE_H, 0.07]} mat={{ color: F.orange, roughness: .6 }} />
            ))}
            {[0.02, ETAGE_H].map((y) => (
              <group key={y} position={[0, y, 0]}>
                <Kasten p={[0, 0, B / 2 - 0.05]} s={[B, 0.06, 0.06]} mat={{ color: F.orange }} />
                <Kasten p={[0, 0, -B / 2 + 0.05]} s={[B, 0.06, 0.06]} mat={{ color: F.orange }} />
                <Kasten p={[B / 2 - 0.05, 0, 0]} s={[0.06, 0.06, B]} mat={{ color: F.orange }} />
                <Kasten p={[-B / 2 + 0.05, 0, 0]} s={[0.06, 0.06, B]} mat={{ color: F.orange }} />
              </group>
            ))}
            <mesh position={[0, ETAGE_H / 2, 0]}><boxGeometry args={[B - 0.3, ETAGE_H - 0.1, B - 0.3]} /><meshStandardMaterial color="#9fb6ff" transparent opacity={0.16} depthWrite={false} /></mesh>
          </group>
        )}
        {!naechste && <Kasten p={[0, hoehe + 0.08, 0]} s={[B + 0.3, 0.16, B + 0.3]} r={0.05} mat={{ color: F.schwarz, roughness: .6 }} />}
        <mesh position={[0, hoehe / 2 + 0.6, 0]}><boxGeometry args={[B + 1, hoehe + 1.6, B + 1]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
      {/* die beiden Gruender vor der Tuer */}
      {([[-0.5, '#b5400c'], [0.45, '#1f2f5c']] as const).map(([x, farbe], i) => (
        <group key={i} position={[x, 0.16, B / 2 + 1.0]}>
          <mesh position={[0, 0.34, 0]} castShadow><capsuleGeometry args={[0.16, 0.3, 6, 12]} /><Mat color={farbe} roughness={.7} /></mesh>
          <mesh position={[0, 0.78, 0]} castShadow><sphereGeometry args={[0.14, 16, 12]} /><Mat color={F.weiss} roughness={.8} /></mesh>
        </group>
      ))}
      <Html position={[0, hoehe + (naechste ? ETAGE_H : 0) + 0.9, 0]} center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
        <div className="wl-zentrale">
          <strong>Sow &amp; Loynab</strong>
          <small>Level {level.nr} · {level.name}{naechste ? ` · ${naechste.etage.name} ${naechste.text}` : ''}</small>
        </div>
      </Html>
    </group>
  )
}

/** Plaetze fuer Laeden (u, v) -- Hochformat: zwei Spalten; Querformat: in die Breite. */
const PLAETZE_HOCH: [number, number][] = [[-4.7, 0.2], [4.7, 0.2], [-3.7, 7.0], [3.7, 7.0], [-4.7, -7.0], [4.7, -7.0], [-3.7, 13.0], [3.7, 13.0], [-3.7, -12.0], [3.7, -12.0]]
const PLAETZE_QUER: [number, number][] = [[-5.6, 0.2], [5.6, 0.2], [-4.4, 7.0], [4.4, 7.0], [-10.6, 1.4], [10.6, 1.4], [-9.6, 7.6], [9.6, 7.6], [-9.2, -5.4], [9.2, -5.4]]

/** fu/fv strecken das Raster, damit der Block das Bild fuellt (hohes Handy: mehr Tiefe, breiter Monitor: mehr Breite). */
function blockMass(hoch: boolean, anzahl: number, fu = 1, fv = 1): { plaetze: [number, number][]; breite: number; v0: number; v1: number } {
  const plaetze = (hoch ? PLAETZE_HOCH : PLAETZE_QUER).slice(0, Math.max(2, anzahl)).map(([u, v]) => [u * fu, v * fv] as [number, number])
  const us = plaetze.map((p) => Math.abs(p[0])), vs = plaetze.map((p) => p[1])
  return { plaetze, breite: (Math.max(...us, 3) + 2.6) * 2, v0: Math.min(...vs, -3.5) - 2.8, v1: Math.max(...vs, 3.5) + 2.8 }
}

function Block({ etagen, level, nacht, leben, gewaehlt, onWaehlen, onAnsicht, onFrei }: WeltProps) {
  const { camera, size } = useThree()
  const hoch = size.height >= size.width * 0.85
  const kunden = leben.kunden.slice(0, 9)
  const RAND_OBEN = 5.2 // Platz fuer Haushoehe und Schilder (Welt-Einheiten am Bildschirm)
  const { m, fv } = useMemo(() => {
    const n = kunden.length + 1
    const b = blockMass(hoch, n)
    const zw = size.width / (b.breite + 0.6), zh = (size.height - 56) / ((b.v1 - b.v0) * 0.577 + RAND_OBEN)
    // Breite begrenzt (Handy): in die Tiefe strecken. Hoehe begrenzt (PC): in die Breite strecken.
    const fv = zw < zh ? Math.min(1.5, Math.max(1, ((size.height - 56) / zw - RAND_OBEN) / ((b.v1 - b.v0) * 0.577))) : 1
    const fu = zh < zw ? Math.min(1.5, Math.max(1, (size.width / zh - 0.6) / b.breite)) : 1
    return { m: blockMass(hoch, n, fu, fv), fv }
  }, [hoch, kunden.length, size.width, size.height])
  const tiefe = m.v1 - m.v0, vMitte = (m.v0 + m.v1) / 2

  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    // etwas nach hinten zielen: oben liegen die Anzeigen ueber der Welt
    const ziel = new THREE.Vector3(...uv(0, vMitte - 1.2, 1.2))
    cam.position.set(ziel.x + 14, ziel.y + 14, ziel.z + 14)
    cam.lookAt(ziel)
    // Der Block muss ganz ins Bild: Breite in u, Tiefe in v (von schraeg oben um 0,577 gestaucht) plus Haushoehe
    cam.zoom = Math.min(size.width / (m.breite + 0.6), (size.height - 56) / (tiefe * 0.577 + RAND_OBEN))
    cam.updateProjectionMatrix()
  }, [camera, size, m.breite, tiefe, vMitte])

  const strassen = [3.6 * fv, hoch ? 10.0 * fv : -99].filter((v) => v > m.v0 + 1 && v < m.v1 - 1)
  return (
    <>
      {/* Boden: am Bildschirm ausgerichtet (um 45 Grad gedreht) */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <Kasten p={[0, -0.3, vMitte]} s={[m.breite, 0.6, tiefe]} r={0.25} mat={{ color: nacht ? '#2f5a45' : '#5fae76', roughness: 1 }} />
        <Kasten p={[0, -0.72, vMitte]} s={[m.breite - 0.5, 0.4, tiefe - 0.5]} r={0.2} mat={{ color: '#3a2a20', roughness: 1 }} />
        {/* Strassen quer */}
        {strassen.map((v) => (
          <group key={v}>
            <Kasten p={[0, 0.005, v]} s={[m.breite - 0.8, 0.03, 1.5]} r={0.01} mat={{ color: '#4a4f5c', roughness: 1 }} />
            {Array.from({ length: Math.floor((m.breite - 2) / 1.6) }, (_, i) => (
              <Kasten key={i} p={[-(m.breite - 2) / 2 + 0.8 + i * 1.6, 0.025, v]} s={[0.6, 0.01, 0.08]} mat={{ color: '#e8e2d4' }} />
            ))}
          </group>
        ))}
        {/* Weg von der Strasse zur Agentur */}
        <Kasten p={[0, 0.005, (2.3 + 3.6 * fv - 0.75) / 2]} s={[1.3, 0.03, Math.max(0.4, 3.6 * fv - 0.75 - 2.3)]} r={0.01} mat={{ color: '#cfc6b8', roughness: 1 }} />
      </group>

      <Zentrale etagen={etagen} level={level} nacht={nacht} onRein={() => onAnsicht('haus')} />

      {kunden.map((k, i) => (
        <Laden key={k.id} k={k} i={i} position={uv(m.plaetze[i][0], m.plaetze[i][1])} aktiv={gewaehlt === `kunde:${k.id}`} nacht={nacht} onWaehlen={onWaehlen} />
      ))}
      {m.plaetze[kunden.length] && <FreiesGrundstueck position={uv(m.plaetze[kunden.length][0], m.plaetze[kunden.length][1])} onFrei={onFrei} />}

      {/* Gruen und Licht */}
      <Baum position={uv(-m.breite / 2 + 1.1, m.v0 + 1.2)} />
      <Baum position={uv(m.breite / 2 - 1.1, m.v0 + 1.4)} s={0.85} />
      <Baum position={uv(0, m.v0 + 1.3)} s={1.1} />
      <Baum position={uv(-m.breite / 2 + 1.0, m.v1 - 1.1)} s={0.9} />
      <Baum position={uv(m.breite / 2 - 1.0, m.v1 - 1.2)} />
      <Laterne position={uv(-2.4, 2.5)} nacht={nacht} />
      <Laterne position={uv(2.4, 2.5)} nacht={nacht} />
    </>
  )
}

// ==================================================================== HAUS

const HB = 8.4   // Breite innen
const HT = 3.3   // Tiefe
const HH = 3.5   // Etagenhoehe

function EtagenSchale({ i, e, children }: { i: number; e: EtageStand; children: React.ReactNode }) {
  const y = i * HH
  return (
    <group position={[0, y, 0]}>
      {/* Boden */}
      <Kasten p={[0, -0.1, 0]} s={[HB + 0.5, 0.2, HT + 0.3]} r={0.03} mat={{ color: i === 0 ? F.holz : F.holzDunkel, roughness: .8 }} />
      {/* Rueckwand in Etagenfarbe */}
      <Kasten p={[0, HH / 2 - 0.1, -HT / 2 - 0.1]} s={[HB + 0.5, HH, 0.2]} r={0.02} mat={{ color: e.etage.farbe, roughness: .95 }} />
      {/* Seitenwaende */}
      <Kasten p={[-HB / 2 - 0.15, HH / 2 - 0.1, 0]} s={[0.2, HH, HT + 0.3]} r={0.02} mat={{ color: '#e9e2d6', roughness: .9 }} />
      <Kasten p={[HB / 2 + 0.15, HH / 2 - 0.1, 0]} s={[0.2, HH, HT + 0.3]} r={0.02} mat={{ color: '#e9e2d6', roughness: .9 }} />
      {/* Fussleiste */}
      <Kasten p={[0, 0.08, -HT / 2 + 0.03]} s={[HB, 0.16, 0.05]} mat={{ color: F.leiste }} />
      <Html position={[-HB / 2 + 0.25, HH - 0.55, -HT / 2 + 0.1]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
        <div className="wl-etage"><strong>{e.etage.name}</strong></div>
      </Html>
      {children}
    </group>
  )
}

function Baustelle({ i, e }: { i: number; e: EtageStand }) {
  const y = i * HH
  const kran = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (kran.current) kran.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.5 })
  return (
    <group position={[0, y, 0]}>
      <Kasten p={[0, -0.1, 0]} s={[HB + 0.5, 0.2, HT + 0.3]} r={0.03} mat={{ color: '#8a8f99', roughness: 1 }} />
      {/* Geruest */}
      {[-HB / 2, -HB / 6, HB / 6, HB / 2].map((x) => (
        <group key={x}>
          <Kasten p={[x, HH / 2 - 0.1, HT / 2]} s={[0.09, HH, 0.09]} mat={{ color: F.orange, roughness: .6 }} />
          <Kasten p={[x, HH / 2 - 0.1, -HT / 2]} s={[0.09, HH, 0.09]} mat={{ color: F.orange, roughness: .6 }} />
        </group>
      ))}
      {[1.2, 2.4, HH - 0.15].map((h) => <Kasten key={h} p={[0, h, HT / 2]} s={[HB + 0.1, 0.07, 0.07]} mat={{ color: F.orange }} />)}
      <mesh position={[0, HH / 2, -0.2]}><boxGeometry args={[HB, HH - 0.3, HT - 0.4]} /><meshStandardMaterial color="#9fb6ff" transparent opacity={0.1} depthWrite={false} /></mesh>
      {/* Material */}
      <Kasten p={[-2.6, 0.25, 0.2]} s={[1.2, 0.5, 0.8]} r={0.02} mat={{ color: '#b98a5a', roughness: 1 }} />
      <Kasten p={[-2.4, 0.7, 0.2]} s={[0.8, 0.4, 0.6]} r={0.02} mat={{ color: '#c79a68', roughness: 1 }} />
      {/* kleiner Kran */}
      <group position={[2.6, 0, -0.4]}>
        <Kasten p={[0, 1.2, 0]} s={[0.16, 2.4, 0.16]} mat={{ color: F.gold, roughness: .5 }} />
        <group ref={kran} position={[0, 2.4, 0]}>
          <Kasten p={[-0.7, 0, 0]} s={[2.2, 0.12, 0.12]} mat={{ color: F.gold, roughness: .5 }} />
          <Kasten p={[-1.5, -0.5, 0]} s={[0.02, 1.0, 0.02]} mat={{ color: F.schwarz }} />
          <Kasten p={[-1.5, -1.05, 0]} s={[0.3, 0.2, 0.3]} r={0.02} mat={{ color: F.grau }} />
        </group>
      </group>
      <Html position={[0, HH / 2 + 0.2, HT / 2]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
        <div className="wl-bau">
          <small>Nächste Etage</small>
          <strong>{e.etage.name}</strong>
          <span>{e.text}</span>
          <div><i style={{ width: `${Math.round(e.fortschritt * 100)}%` }} /></div>
        </div>
      </Html>
    </group>
  )
}

/** Kamera auf Stativ + Softbox: das Studio fuer die eigenen Videos. */
function Drehset() {
  return (
    <group>
      <Zylinder p={[0, 0.7, 0]} r={0.03} h={1.4} mat={{ color: F.schwarz }} seg={8} />
      {[0, 2.1, 4.2].map((a) => <Kasten key={a} p={[Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22]} s={[0.03, 0.66, 0.03]} rot={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]} mat={{ color: F.schwarz }} />)}
      <Kasten p={[0, 1.5, 0]} s={[0.42, 0.28, 0.26]} r={0.04} mat={{ color: F.schwarz, roughness: .4 }} />
      <mesh position={[-0.28, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.1, 0.12, 0.2, 14]} /><Mat color={F.grau} metalness={.5} roughness={.3} /></mesh>
      {/* Softbox */}
      <group position={[1.5, 0, -0.5]}>
        <Zylinder p={[0, 0.9, 0]} r={0.03} h={1.8} mat={{ color: F.schwarz }} seg={8} />
        <Kasten p={[0, 2.0, 0]} s={[0.12, 0.9, 0.9]} r={0.04} mat={{ color: '#fff7e6', emissive: '#ffe9c0', emissiveIntensity: 1.2 }} />
      </group>
    </group>
  )
}

function Haus({ etagen, nacht, leben, offeneQuests, hits, gewaehlt, onWaehlen, scroll }: WeltProps & { scroll: React.MutableRefObject<{ y: number; min: number; max: number; zoom: number }> }) {
  const { camera, size } = useThree()
  const a = useMemo(() => Object.fromEntries(AUSSTATTUNG.map((x) => [x.key, x])) as Record<string, Ausstattung>, [])
  const stehen = etagen.filter((e) => e.frei)
  const naechste = etagen.find((e) => !e.frei)
  const hatBuero = stehen.some((e) => e.etage.key === 'buero')
  const anzahl = stehen.length + (naechste ? 1 : 0)

  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / (HB + 1.4), size.height / (HH * 1.9))
    cam.updateProjectionMatrix()
    const sichtbar = size.height / cam.zoom
    const s = scroll.current
    s.zoom = cam.zoom
    s.min = Math.min(sichtbar / 2 - 1.2, (anzahl * HH) / 2)
    s.max = Math.max(s.min, anzahl * HH - sichtbar / 2 + 1.4)
    // Start: oberste fertige Etage im Blick (dort wird gearbeitet), die Baustelle lugt oben rein
    s.y = Math.min(s.max, Math.max(s.min, (stehen.length - 0.45) * HH))
  }, [camera, size, anzahl, stehen.length, scroll])

  useFrame(() => {
    const y = scroll.current.y
    camera.position.set(0, y + 3.4, 24)
    camera.lookAt(0, y, 0)
  })

  const st = (key: string, position: [number, number, number], hoch: number, kind: React.ReactNode, rotation?: [number, number, number]) => (
    <Stueck a={a[key]} gesperrt={false} hoch={hoch} aktiv={gewaehlt === key} onWaehlen={onWaehlen} position={position} rotation={rotation}>{kind}</Stueck>
  )
  const wand = -HT / 2 + 0.04
  const wartende = leben.kunden.filter((k) => k.ampel === 'rot').slice(0, 3)

  const inhalt = (key: string): React.ReactNode => {
    switch (key) {
      case 'cafe': return (
        <>
          {st('cafetisch', [-2.3, 0, 0.1], 2.0, <CafeTisch nacht={nacht} dringend={leben.dringend} vorschlaege={leben.vorschlaege} />, [0, Math.PI / 2, 0])}
          {st('kaffee', [1.2, 0, -1.2], 2.0, <Kaffee nacht={nacht} />)}
          {st('kasse', [3.2, 0, -1.0], 2.0, <Kasse nacht={nacht} />)}
          {!hatBuero && st('kalender', [-1.8, 2.3, wand], 1.0, <group scale={0.8}><Kalender nacht={nacht} /></group>)}
          {!hatBuero && st('pinnwand', [0.2, 2.3, wand], 1.0, <group scale={0.8}><Pinnwand zettel={offeneQuests} /></group>)}
          {/* Kunden, die gerade etwas brauchen, warten im Cafe */}
          {wartende.map((k, i) => (
            <Figur key={k.id} k={k} i={i} position={[0.6 + i * 0.9, 0, 0.9]} aktiv={gewaehlt === `kunde:${k.id}`} onWaehlen={onWaehlen} />
          ))}
        </>
      )
      case 'backstube': return (
        <>
          {st('ofen', [2.4, 0, -0.6], 3.1, <Ofen an={leben.imOfen > 0} nacht={nacht} />)}
          {st('aktenschrank', [-3.0, 0, -0.8], 2.4, <Aktenschrank voll={leben.dokumente} />, [0, -Math.PI / 2, 0])}
          {/* Arbeitstisch mit Blechen */}
          <Kasten p={[-0.6, 0.8, -0.7]} s={[2.2, 0.08, 1.0]} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} />
          {([[-1.6, -1.1], [0.4, -1.1], [-1.6, -0.3], [0.4, -0.3]] as const).map(([x, z], i) => <Kasten key={i} p={[x, 0.4, z]} s={[0.06, 0.8, 0.06]} mat={{ color: F.schwarz }} />)}
          {[-1.1, -0.3].map((x) => <Zylinder key={x} p={[x, 0.87, -0.7]} r={0.3} h={0.04} mat={{ color: '#e6b877', roughness: .8 }} seg={20} />)}
        </>
      )
      case 'buero': return (
        <>
          {st('schreibtisch', [-2.0, 0, -0.7], 2.2, <Schreibtisch nacht={nacht} dringend={leben.dringend} vorschlaege={leben.vorschlaege} />)}
          {st('kalender', [1.0, 2.2, wand], 1.0, <Kalender nacht={nacht} />)}
          {st('pinnwand', [3.1, 2.2, wand], 1.0, <Pinnwand zettel={offeneQuests} />)}
          {st('pflanze', [3.5, 0, 0.5], 1.9, <group scale={0.7}><Pflanze /></group>)}
        </>
      )
      case 'studio': return (
        <>
          {st('neon', [-1.9, 1.95, wand], 0.9, <Neon nacht={nacht} />)}
          {st('pokale', [2.9, 1.9, wand + 0.15], 0.7, <Pokale anzahl={hits} />)}
          <group position={[0.6, 0, 0.3]}><Drehset /></group>
          {/* Hintergrundrolle */}
          <Kasten p={[1.0, 0.9, -1.2]} s={[1.8, 1.6, 0.05]} mat={{ color: '#f3ece0', roughness: 1 }} />
        </>
      )
      case 'team': return (
        <>
          {st('tisch2', [-2.2, 0, -0.5], 1.9, <Tisch2 />)}
          {st('sofa', [2.2, 0, -0.9], 1.6, <Sofa />, [0, Math.PI / 2, 0])}
        </>
      )
      case 'chef': return st('konferenz', [0, 0, -0.1], 1.6, <group scale={0.85}><Konferenz /></group>)
      default: return null
    }
  }

  return (
    <>
      {/* Gehweg */}
      <Kasten p={[0, -0.45, 0.6]} s={[HB + 6, 0.5, HT + 3]} r={0.05} mat={{ color: '#4a4f5c', roughness: 1 }} />
      {stehen.map((e, i) => <EtagenSchale key={e.etage.key} i={i} e={e}>{inhalt(e.etage.key)}</EtagenSchale>)}
      {naechste
        ? <Baustelle i={stehen.length} e={naechste} />
        : <Kasten p={[0, stehen.length * HH, 0]} s={[HB + 0.9, 0.3, HT + 0.6]} r={0.05} mat={{ color: F.schwarz, roughness: .6 }} />}
      {/* Deckenlicht je Etage */}
      {stehen.map((e, i) => (
        <group key={e.etage.key} position={[0, i * HH + HH - 0.35, 0]}>
          <mesh><sphereGeometry args={[0.11, 12, 8]} /><meshStandardMaterial color="#fff2d6" emissive="#ffd9a0" emissiveIntensity={nacht ? 2.5 : 1} /></mesh>
          {nacht && <pointLight intensity={26} distance={10} decay={1.6} color="#ffd9a0" />}
        </group>
      ))}
    </>
  )
}

// =================================================================== WELT

function Licht({ nacht, haus }: { nacht: boolean; haus: boolean }) {
  return (
    <>
      <hemisphereLight args={[nacht ? '#4a5a9a' : '#e4ecff', nacht ? '#1a1410' : '#7a5a3a', nacht ? .4 : 1.2]} />
      <ambientLight intensity={nacht ? (haus ? .45 : .2) : .5} />
      <directionalLight
        position={haus ? [6, 30, 18] : [10, 16, 4]} intensity={nacht ? .3 : 2.0} color={nacht ? '#9fb0ff' : '#fff1d6'} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.05}
        shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={26} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={80}
      />
      <directionalLight position={[-8, 6, 10]} intensity={nacht ? .12 : .55} color="#ffd9b0" />
    </>
  )
}

export default function Welt(p: WeltProps) {
  const scroll = useRef({ y: 0, min: 0, max: 0, zoom: 40 })
  const zieh = useRef<{ y0: number; s0: number } | null>(null)
  const haus = p.ansicht === 'haus'
  const klemm = (y: number) => Math.min(scroll.current.max, Math.max(scroll.current.min, y))
  return (
    <div
      className={`st-buehne wl-buehne ${haus ? 'haus' : 'block'}`}
      onPointerDown={(e) => { if (haus) zieh.current = { y0: e.clientY, s0: scroll.current.y } }}
      onPointerMove={(e) => { if (haus && zieh.current && e.buttons) scroll.current.y = klemm(zieh.current.s0 + (e.clientY - zieh.current.y0) / scroll.current.zoom) }}
      onPointerUp={() => { zieh.current = null }}
      onPointerLeave={() => { zieh.current = null }}
      onWheel={(e) => { if (haus) scroll.current.y = klemm(scroll.current.y - e.deltaY / scroll.current.zoom) }}
    >
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        orthographic
        camera={{ position: [14, 14, 14], zoom: 30, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: p.nacht ? 1.0 : 1.15 }}
        onPointerMissed={() => p.onWaehlen(null)}
      >
        <color attach="background" args={[p.nacht ? '#0b0f2a' : '#101a33']} />
        <Suspense fallback={null}>
          <Licht nacht={p.nacht} haus={haus} />
          {haus ? <Haus {...p} scroll={scroll} /> : <Block {...p} />}
        </Suspense>
      </Canvas>
    </div>
  )
}
