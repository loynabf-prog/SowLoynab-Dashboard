// Die Welt -- zwei Ansichten auf dieselbe echte Agentur (Fassie, 11.11.2026):
//
//   Dorf:  das Dashboard "von aussen". Die Agentur steht in der Mitte, jeder
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
import { Html, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { AUSSTATTUNG, type Ausstattung, type EtageStand, type FollowerStand, type Level } from '../lib/spiel'
import type { StudioKunde, StudioLeben } from './daten'
import {
  F, Mat, Kasten, Zylinder, Stueck, Figur, Schreibtisch, Ofen, Kalender, Pinnwand, Aktenschrank, Pflanze, Kasse, Kaffee,
  Neon, Pokale, Sofa, Tisch2, Konferenz, CafeTisch,
} from './Studio'

export type Ansicht = 'dorf' | 'haus'

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
  /** Gebaeude, die eine Tafel oeffnen (Quests, Ziele, Bilanz) */
  onOrt: (r: 'quests' | 'ziele' | 'bilanz') => void
  follower: FollowerStand
  umsatzMonat: number
  /** ein Ziel ist erreicht und wartet aufs Einloesen */
  zielBereit: boolean
  /** offene XP je Gebaeude ('zentrale', 'turm', 'bank', 'brett', 'kunde:<id>') */
  beute: Record<string, number>
  onSammeln: (ort: string, wo: { x: number; y: number }) => void
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

// ==================================================================== DORF
// Das Dashboard von aussen, wie ein Aufbauspiel: eine Insel, die den ganzen
// Bildschirm fuellt. Ziehen verschiebt, zwei Finger (oder Mausrad) zoomen.
// Jedes Gebaeude ist etwas Echtes; ueber Gebaeuden mit neuer echter Arbeit
// liegt eine XP-Blase zum Einsammeln.

/** XP-Blase ueber einem Gebaeude. */
function Blase({ xp, y, onSammeln }: { xp: number; y: number; onSammeln: (wo: { x: number; y: number }) => void }) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[40, 20]}>
      <button
        className="wl-beute"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onSammeln({ x: e.clientX, y: e.clientY }) }}
        aria-label={`${xp} XP einsammeln`}
      >+{xp.toLocaleString('de-DE')}<small>XP</small></button>
    </Html>
  )
}

/** Rahmen fuer jedes Gebaeude: Tippen, leichtes Aufploppen, Schild, Blase. */
function Bau({ position, hoehe, schild, beute, onTipp, onSammeln, aktiv = false, children }: {
  position: [number, number, number]; hoehe: number; schild: React.ReactNode; beute?: number
  onTipp: () => void; onSammeln?: (wo: { x: number; y: number }) => void; aktiv?: boolean; children: React.ReactNode
}) {
  const { hover, griff } = useKlick(onTipp)
  const g = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (g.current) { const z = hover || aktiv ? 1.06 : 1; g.current.scale.lerp(new THREE.Vector3(z, z, z), Math.min(1, dt * 10)) } })
  return (
    <group position={position}>
      <group ref={g} {...griff}>
        {children}
        <mesh position={[0, hoehe / 2, 0]}><boxGeometry args={[3, hoehe, 3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
      <Html position={[0, hoehe + 0.45, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>{schild}</Html>
      {!!beute && onSammeln && <Blase xp={beute} y={hoehe + 1.5} onSammeln={onSammeln} />}
    </group>
  )
}

/** Was vor dem Laden steht -- aus dem Namen geraten, damit man ihn erkennt. */
function Requisit({ name, farbe }: { name: string; farbe: string }) {
  const n = name.toLowerCase()
  if (n.includes('fahrschul')) {
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
    return (
      <group position={[0.75, 0, 1.45]}>
        <Zylinder p={[0, 0.04, 0]} r={0.22} h={0.08} mat={{ color: F.stahl, metalness: .6, roughness: .3 }} seg={14} />
        <Zylinder p={[0, 0.6, 0]} r={0.025} h={1.1} mat={{ color: F.stahl, metalness: .6, roughness: .3 }} seg={8} />
        <Zylinder p={[0, 0.6, 0]} r={[0.2, 0.13]} h={0.7} mat={{ color: '#9c5a2c', roughness: .9 }} seg={14} />
      </group>
    )
  }
  if (n.includes('schleck') || n.includes('eis')) {
    return (
      <group position={[0.8, 0, 1.45]}>
        <mesh position={[0, 0.45, 0]} rotation={[Math.PI, 0, 0]} castShadow><coneGeometry args={[0.2, 0.7, 14]} /><Mat color="#d9a45c" roughness={.8} /></mesh>
        <mesh position={[0, 0.9, 0]} castShadow><sphereGeometry args={[0.22, 14, 12]} /><Mat color={farbe} roughness={.6} /></mesh>
        <mesh position={[0.05, 1.18, 0]} castShadow><sphereGeometry args={[0.17, 14, 12]} /><Mat color={F.weiss} roughness={.6} /></mesh>
      </group>
    )
  }
  if (n.includes('kraft') || n.includes('gym') || n.includes('fit') || n.includes('act')) {
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
    return (
      <group position={[0.85, 0, 1.45]}>
        <Zylinder p={[0, 0.55, 0]} r={0.03} h={1.1} mat={{ color: F.schwarz }} seg={8} />
        <mesh position={[0, 1.2, 0]}><sphereGeometry args={[0.17, 14, 12]} /><Mat color="#fff2c9" emissive="#ffd87a" emissiveIntensity={1.6} /></mesh>
      </group>
    )
  }
  return <group position={[0.85, 0, 1.45]}><Zylinder p={[0, 0.18, 0]} r={[0.16, 0.12]} h={0.36} mat={{ color: F.topf, roughness: 1 }} seg={12} /><mesh position={[0, 0.55, 0]} castShadow><sphereGeometry args={[0.26, 12, 10]} /><Mat color={F.pflanze} roughness={.9} /></mesh></group>
}

/** Der Laden eines Kunden. Waechst mit den Videos: Stufe 2 Fahne, 3 zweites Stockwerk, 4 Goldrand, 5 drittes Stockwerk. */
function Laden({ k, i, position, aktiv, nacht, beute, onWaehlen, onSammeln }: {
  k: StudioKunde; i: number; position: [number, number, number]; aktiv: boolean; nacht: boolean; beute: number
  onWaehlen: (key: string | null) => void; onSammeln: (wo: { x: number; y: number }) => void
}) {
  const farbe = k.farbe || PALETTE[i % PALETTE.length]
  const ruf = useRef<THREE.Group>(null)
  const stock = k.stufe >= 5 ? 3 : k.stufe >= 3 ? 2 : 1
  const SH = 1.25 // Hoehe eines Stockwerks
  const dach = 0.12 + stock * SH
  useFrame(({ clock }) => { if (ruf.current) ruf.current.position.y = dach + 1.0 + Math.abs(Math.sin(clock.elapsedTime * 4 + i)) * 0.25 })
  const anteil = k.ziel > 0 ? Math.min(1, k.gepostet / k.ziel) : 1
  const an = nacht ? 1.3 : 0.35
  return (
    <Bau
      position={position} hoehe={dach + 0.2} aktiv={aktiv} beute={beute} onSammeln={onSammeln}
      onTipp={() => onWaehlen(aktiv ? null : `kunde:${k.id}`)}
      schild={
        <div className={`wl-chip ${k.ampel} ${aktiv ? 'aktiv' : ''}`}>
          <i style={{ background: `conic-gradient(currentColor ${Math.round(anteil * 360)}deg, rgba(255,255,255,.18) 0)` }} />
          <span>{kurzName(k.name)}</span>
          <b>{k.ziel > 0 ? `${k.gepostet}/${k.ziel}` : k.gepostet}</b>
          <em>{k.stufe}</em>
        </div>
      }
    >
      <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: '#cfc6b8', roughness: 1 }} />
      {Array.from({ length: stock }, (_, s) => {
        const y = 0.12 + s * SH
        const b = 2.3 - s * 0.25, t = 2.1 - s * 0.25
        return (
          <group key={s} position={[0, y, -0.1]}>
            <Kasten p={[0, SH / 2, 0]} s={[b, SH, t]} r={0.06} mat={{ color: '#f3ece0', roughness: .9 }} />
            <mesh position={[b / 2 + 0.005, SH / 2 + 0.05, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[t * 0.6, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={an} roughness={.3} /></mesh>
            {s > 0 && <mesh position={[0, SH / 2 + 0.05, t / 2 + 0.005]}><planeGeometry args={[b * 0.6, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={an} roughness={.3} /></mesh>}
          </group>
        )
      })}
      {/* Dach in Kundenfarbe, ab Stufe 4 mit Goldrand */}
      <Kasten p={[0, dach + 0.1, -0.1]} s={[2.5 - (stock - 1) * 0.25, 0.2, 2.3 - (stock - 1) * 0.25]} r={0.05} mat={{ color: farbe, roughness: .7 }} />
      {k.stufe >= 4 && <Kasten p={[0, dach - 0.02, -0.1]} s={[2.56 - (stock - 1) * 0.25, 0.07, 2.36 - (stock - 1) * 0.25]} r={0.02} mat={{ color: F.gold, metalness: .7, roughness: .3 }} />}
      {/* Fahne ab Stufe 2 */}
      {k.stufe >= 2 && (
        <group position={[-0.7, dach + 0.2, -0.6]}>
          <Zylinder p={[0, 0.45, 0]} r={0.025} h={0.9} mat={{ color: F.stahl, metalness: .5, roughness: .4 }} seg={8} />
          <Kasten p={[0.22, 0.72, 0]} s={[0.42, 0.26, 0.02]} mat={{ color: farbe, emissive: farbe, emissiveIntensity: .25 }} />
        </group>
      )}
      {/* Markise, Tuer, Schaufenster */}
      <Kasten p={[0, 1.2, 1.15]} s={[2.3, 0.1, 0.55]} r={0.03} rot={[0.28, 0, 0]} mat={{ color: farbe, roughness: .8 }} />
      <Kasten p={[-0.65, 0.55, 0.96]} s={[0.5, 0.86, 0.04]} r={0.02} mat={{ color: '#3b2a1e', roughness: .6 }} />
      <mesh position={[0.4, 0.66, 0.965]}><planeGeometry args={[1.1, 0.66]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={an} roughness={.3} /></mesh>
      <Kasten p={[1.16, 1.22, -0.1]} s={[0.03, 0.16, 1.9]} mat={{ color: farbe, emissive: farbe, emissiveIntensity: nacht ? .6 : .1 }} />
      <Requisit name={k.name} farbe={farbe} />
      {k.ampel === 'rot' && !beute && (
        <group ref={ruf} position={[0, dach + 1.0, 0]}>
          <Kasten p={[0, 0.12, 0]} s={[0.12, 0.36, 0.12]} r={0.05} mat={{ color: F.orange, emissive: F.orange, emissiveIntensity: 1.4 }} />
          <mesh position={[0, -0.18, 0]}><sphereGeometry args={[0.075, 10, 8]} /><Mat color={F.orange} emissive={F.orange} emissiveIntensity={1.4} /></mesh>
        </group>
      )}
    </Bau>
  )
}

function FreiesGrundstueck({ position, onFrei }: { position: [number, number, number]; onFrei: () => void }) {
  return (
    <Bau position={position} hoehe={1.5} onTipp={onFrei} schild={<div className="wl-chip frei"><span>Nächster Kunde</span><b>+</b></div>}>
      <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: '#79b98a', roughness: 1 }} />
      <Kasten p={[0, 0.6, 0.4]} s={[0.08, 1.0, 0.08]} mat={{ color: F.eiche }} />
      <Kasten p={[0, 1.15, 0.4]} s={[1.3, 0.55, 0.06]} r={0.03} mat={{ color: F.weiss, roughness: .8 }} />
      <Kasten p={[0, 1.36, 0.44]} s={[1.3, 0.12, 0.02]} mat={{ color: F.orange }} />
    </Bau>
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

function Fels({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.2, 0]} castShadow><dodecahedronGeometry args={[0.42, 0]} /><Mat color="#8f959f" roughness={1} /></mesh>
      <mesh position={[0.4, 0.12, 0.2]} castShadow><dodecahedronGeometry args={[0.24, 0]} /><Mat color="#a3a9b3" roughness={1} /></mesh>
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

const ETAGE_H = 1.05 // Hoehe einer Etage am kleinen Haus im Dorf
const ZB = 3.4       // Breite der Zentrale

/** Die Agentur von aussen: so viele Etagen, wie wirklich stehen -- plus Baugeruest fuer die naechste. */
function Zentrale({ etagen, level, nacht, beute, onRein, onSammeln }: { etagen: EtageStand[]; level: Level; nacht: boolean; beute: number; onRein: () => void; onSammeln: (wo: { x: number; y: number }) => void }) {
  const stehen = etagen.filter((e) => e.frei)
  const naechste = etagen.find((e) => !e.frei)
  const hoehe = 0.2 + stehen.length * ETAGE_H
  const B = ZB
  return (
    <Bau
      position={[0, 0, 0]} hoehe={hoehe + (naechste ? ETAGE_H : 0.2)} beute={beute} onSammeln={onSammeln} onTipp={onRein}
      schild={
        <div className="wl-zentrale">
          <strong>Sow &amp; Loynab</strong>
          <small>Level {level.nr} · {level.name}{naechste ? ` · ${naechste.etage.name} ${naechste.text}` : ''}</small>
        </div>
      }
    >
      <Kasten p={[0, 0.08, 0]} s={[B + 1.2, 0.16, B + 1.2]} r={0.05} mat={{ color: '#d9d1c4', roughness: 1 }} />
      {stehen.map((e, i) => {
        const y = 0.16 + i * ETAGE_H
        return (
          <group key={e.etage.key} position={[0, y, 0]}>
            <Kasten p={[0, ETAGE_H / 2, 0]} s={[B, ETAGE_H - 0.06, B]} r={0.05} mat={{ color: i === 0 ? '#f0e4d2' : '#eef0f4', roughness: .85 }} />
            <Kasten p={[0, ETAGE_H - 0.06, 0]} s={[B + 0.12, 0.1, B + 0.12]} r={0.03} mat={{ color: e.etage.farbe, roughness: .7 }} />
            {[-1, 0, 1].map((f) => (
              <group key={f}>
                <mesh position={[f * 1.0, ETAGE_H / 2 - 0.04, B / 2 + 0.005]}><planeGeometry args={[0.62, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.4 : .3} roughness={.3} /></mesh>
                <mesh position={[B / 2 + 0.005, ETAGE_H / 2 - 0.04, f * 1.0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.62, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.4 : .3} roughness={.3} /></mesh>
              </group>
            ))}
          </group>
        )
      })}
      <Kasten p={[0, 0.9, B / 2 + 0.3]} s={[B, 0.1, 0.65]} r={0.03} rot={[0.3, 0, 0]} mat={{ color: F.orange, roughness: .8 }} />
      <Kasten p={[B / 2 + 0.3, 0.9, 0]} s={[0.65, 0.1, B]} r={0.03} rot={[0, 0, -0.3]} mat={{ color: F.orange, roughness: .8 }} />
      <Kasten p={[0, 0.55, B / 2 + 0.01]} s={[0.6, 0.78, 0.04]} r={0.02} mat={{ color: '#3b2a1e', roughness: .6 }} />
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
      {/* die beiden Gruender vor der Tuer */}
      {([[-0.5, '#b5400c'], [0.45, '#1f2f5c']] as const).map(([x, farbe], i) => (
        <group key={i} position={[x, 0.16, B / 2 + 1.0]}>
          <mesh position={[0, 0.34, 0]} castShadow><capsuleGeometry args={[0.16, 0.3, 6, 12]} /><Mat color={farbe} roughness={.7} /></mesh>
          <mesh position={[0, 0.78, 0]} castShadow><sphereGeometry args={[0.14, 16, 12]} /><Mat color={F.weiss} roughness={.8} /></mesh>
        </group>
      ))}
    </Bau>
  )
}

/** Sendeturm = Personal Brand. Waechst mit jeder vollen 1.000 Follower. */
function Sendeturm({ marken, nacht }: { marken: number; nacht: boolean }) {
  const h = 2.6 + Math.min(8, marken) * 0.55
  const licht = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => { if (licht.current) licht.current.emissiveIntensity = 0.6 + (Math.sin(clock.elapsedTime * 3) > 0.2 ? 2.4 : 0) })
  return (
    <group>
      <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: '#cfc6b8', roughness: 1 }} />
      <Kasten p={[0, 0.5, 0]} s={[1.9, 0.8, 1.9]} r={0.06} mat={{ color: '#2a2f45', roughness: .7 }} />
      <mesh position={[0, 0.5, 0.955]}><planeGeometry args={[1.3, 0.4]} /><meshStandardMaterial color={F.orange} emissive={F.orange} emissiveIntensity={nacht ? 1.6 : .6} /></mesh>
      {Array.from({ length: Math.round(h / 0.55) }, (_, i) => (
        <Zylinder key={i} p={[0, 0.9 + i * 0.55 + 0.275, 0]} r={[Math.max(0.08, 0.34 - (i + 1) * 0.022), Math.max(0.1, 0.34 - i * 0.022)]} h={0.55} mat={{ color: i % 2 ? F.weiss : '#e5484d', roughness: .6 }} seg={10} />
      ))}
      {/* Schuessel */}
      <mesh position={[0.3, 0.9 + h * 0.6, 0.2]} rotation={[0.9, 0.6, 0]} castShadow><coneGeometry args={[0.32, 0.2, 16, 1, true]} /><meshStandardMaterial color={F.weiss} roughness={.4} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.9 + h + 0.12, 0]}><sphereGeometry args={[0.12, 12, 10]} /><meshStandardMaterial ref={licht} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={2} /></mesh>
    </group>
  )
}

/** Bank = Geld: Umsatz, bezahlte Rechnungen, abgeschlossene Monate. */
function Bank({ nacht }: { nacht: boolean }) {
  return (
    <group>
      <Kasten p={[0, 0.1, 0]} s={[3.0, 0.2, 2.8]} r={0.04} mat={{ color: '#d8d0c2', roughness: 1 }} />
      <Kasten p={[0, 1.0, -0.2]} s={[2.5, 1.6, 2.0]} r={0.05} mat={{ color: '#f1ead9', roughness: .85 }} />
      {[-0.9, -0.3, 0.3, 0.9].map((x) => <Zylinder key={x} p={[x, 0.95, 0.95]} r={0.11} h={1.5} mat={{ color: F.weiss, roughness: .6 }} seg={12} />)}
      <Kasten p={[0, 1.85, 0.1]} s={[2.8, 0.2, 2.7]} r={0.04} mat={{ color: '#e3dac6', roughness: .8 }} />
      <mesh position={[0, 2.2, 0.1]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1.7, 0.6, 4]} /><Mat color="#c9a24a" metalness={.5} roughness={.4} /></mesh>
      <mesh position={[0, 1.15, 0.82]}><planeGeometry args={[0.6, 1.0]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.4 : .4} /></mesh>
      {/* Muenze */}
      <mesh position={[1.36, 1.2, -0.2]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 0.06, 20]} /><Mat color={F.gold} metalness={.8} roughness={.25} emissive={F.gold} emissiveIntensity={.2} /></mesh>
    </group>
  )
}

/** Backstube = Schnitt (der Ofen). Raucht, wenn gerade etwas gebacken wird. */
function Backstube({ an, nacht }: { an: boolean; nacht: boolean }) {
  const rauch = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!rauch.current) return
    rauch.current.children.forEach((c, i) => { const t = (clock.elapsedTime * 0.5 + i * 0.33) % 1; c.position.y = t * 1.3; c.scale.setScalar(0.4 + t * 0.9); (c as THREE.Mesh).visible = an })
  })
  return (
    <group>
      <Kasten p={[0, 0.06, 0]} s={[2.9, 0.12, 2.9]} r={0.04} mat={{ color: '#cfc6b8', roughness: 1 }} />
      <Kasten p={[0, 0.85, -0.1]} s={[2.3, 1.5, 2.1]} r={0.06} mat={{ color: '#a6533c', roughness: .9 }} />
      <Kasten p={[0, 1.7, -0.1]} s={[2.5, 0.2, 2.3]} r={0.05} mat={{ color: '#5a3324', roughness: .8 }} />
      <Kasten p={[0.6, 2.2, -0.5]} s={[0.5, 0.9, 0.5]} r={0.04} mat={{ color: '#7a4234', roughness: .9 }} />
      <group ref={rauch} position={[0.6, 2.75, -0.5]}>
        {[0, 1, 2].map((i) => <mesh key={i}><sphereGeometry args={[0.22, 10, 8]} /><meshStandardMaterial color="#e8e8ee" transparent opacity={0.55} depthWrite={false} /></mesh>)}
      </group>
      {/* Ofenmaul vorn */}
      <mesh position={[0, 0.6, 0.955]}><circleGeometry args={[0.5, 20, 0, Math.PI]} /><meshStandardMaterial color="#ffb347" emissive="#ff7a1a" emissiveIntensity={an ? 2.2 : nacht ? .5 : .15} /></mesh>
      <Kasten p={[0, 0.35, 0.96]} s={[1.0, 0.5, 0.02]} mat={{ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: an ? 2.2 : nacht ? .5 : .15 }} />
      <mesh position={[1.155, 0.95, -0.1]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.2, 0.5]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={nacht ? 1.3 : .35} /></mesh>
    </group>
  )
}

/** Uhrturm = Kalender. */
function Uhrturm() {
  return (
    <group>
      <Kasten p={[0, 0.06, 0]} s={[2.2, 0.12, 2.2]} r={0.04} mat={{ color: '#cfc6b8', roughness: 1 }} />
      <Kasten p={[0, 1.6, 0]} s={[1.1, 3.0, 1.1]} r={0.05} mat={{ color: '#f1ead9', roughness: .85 }} />
      <mesh position={[0, 3.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1.0, 0.9, 4]} /><Mat color="#3d5a80" roughness={.7} /></mesh>
      {([[0, 0.56, 0], [0.56, 0, Math.PI / 2]] as const).map(([x, z, r], i) => (
        <group key={i} position={[x, 2.5, z]} rotation={[0, r, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.36, 0.36, 0.04, 20]} /><Mat color={F.weiss} roughness={.5} /></mesh>
          <Kasten p={[0, 0.1, 0.03]} s={[0.04, 0.24, 0.01]} mat={{ color: F.schwarz }} />
          <Kasten p={[0.08, 0, 0.03]} s={[0.18, 0.04, 0.01]} mat={{ color: F.schwarz }} />
        </group>
      ))}
    </group>
  )
}

/** Schwarzes Brett = Quests. */
function Brett({ zettel }: { zettel: number }) {
  const farben = ['#ffd60a', '#ff9f0a', '#64d2ff', '#30d158', '#ff375f', '#bf5af2']
  return (
    <group>
      {[-0.75, 0.75].map((x) => <Kasten key={x} p={[x, 0.7, 0]} s={[0.1, 1.4, 0.1]} mat={{ color: F.eiche, roughness: .9 }} />)}
      <Kasten p={[0, 1.05, 0]} s={[1.7, 0.95, 0.08]} r={0.03} mat={{ color: '#b98a5a', roughness: .9 }} />
      <Kasten p={[0, 1.6, 0]} s={[1.9, 0.12, 0.3]} r={0.03} mat={{ color: '#5a3324', roughness: .8 }} />
      {Array.from({ length: Math.min(6, zettel) }, (_, i) => (
        <Kasten key={i} p={[-0.55 + (i % 3) * 0.55, 1.25 - Math.floor(i / 3) * 0.4, 0.05]} s={[0.34, 0.28, 0.01]} rot={[0, 0, (i % 2 ? 1 : -1) * 0.08]} mat={{ color: farben[i], roughness: .8 }} />
      ))}
    </group>
  )
}

/** Schatztruhe = Ziele mit echter Belohnung. Leuchtet, wenn eins einzuloesen ist. */
function Truhe({ bereit }: { bereit: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (g.current) g.current.position.y = bereit ? 0.1 + Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.15 : 0 })
  return (
    <group ref={g}>
      <Kasten p={[0, 0.4, 0]} s={[1.3, 0.7, 0.9]} r={0.06} mat={{ color: '#7a4a24', roughness: .8 }} />
      <mesh position={[0, 0.75, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.45, 0.45, 1.3, 16, 1, false, 0, Math.PI]} /><Mat color="#8a5730" roughness={.8} /></mesh>
      {[-0.45, 0.45].map((x) => <Kasten key={x} p={[x, 0.45, 0]} s={[0.12, 0.82, 0.94]} r={0.02} mat={{ color: F.gold, metalness: .7, roughness: .3 }} />)}
      <Kasten p={[0, 0.62, 0.46]} s={[0.2, 0.24, 0.05]} r={0.02} mat={{ color: F.gold, metalness: .7, roughness: .3, emissive: F.gold, emissiveIntensity: bereit ? 1.5 : .1 }} />
      {bereit && <pointLight position={[0, 1.2, 0]} intensity={3} distance={5} decay={2} color="#ffd87a" />}
    </group>
  )
}

/** Pokal-Park: fuer jeden Hit eine goldene Figur. */
function PokalPark({ hits }: { hits: number }) {
  return (
    <group>
      <Kasten p={[0, 0.1, 0]} s={[2.6, 0.2, 2.2]} r={0.05} mat={{ color: '#d8d0c2', roughness: 1 }} />
      {Array.from({ length: Math.max(1, Math.min(6, hits)) }, (_, i) => {
        const x = -0.8 + (i % 3) * 0.8, z = -0.4 + Math.floor(i / 3) * 0.8
        const da = i < hits
        return (
          <group key={i} position={[x, 0.2, z]}>
            <Kasten p={[0, 0.15, 0]} s={[0.4, 0.3, 0.4]} r={0.03} mat={{ color: '#8f959f', roughness: .9 }} />
            {da && <>
              <Zylinder p={[0, 0.5, 0]} r={[0.16, 0.06]} h={0.36} mat={{ color: F.gold, metalness: .8, roughness: .25 }} seg={14} />
              <mesh position={[0, 0.78, 0]}><sphereGeometry args={[0.1, 12, 10]} /><Mat color={F.gold} metalness={.8} roughness={.25} emissive={F.gold} emissiveIntensity={.3} /></mesh>
            </>}
          </group>
        )
      })}
    </group>
  )
}

/** Plaetze (u, v): u nach rechts, v nach vorn. Querformat zuerst gedacht -- am Handy hochkant wird gewischt. */
const LADEN_PLAETZE: [number, number][] = [[-5.8, 0.2], [5.8, 0.2], [-4.8, 7.4], [4.8, 7.4], [-10.8, 1.6], [10.8, 1.6], [-10.2, 8.0], [10.2, 8.0]]
const INSEL = { u: 14.5, v0: -11.5, v1: 12.5 }

function Dorf(p: WeltProps) {
  const { camera, size } = useThree()
  const steuerung = useRef<OrbitControlsImpl>(null)
  const kunden = p.leben.kunden.slice(0, LADEN_PLAETZE.length)
  const frei = LADEN_PLAETZE[kunden.length]
  const nacht = p.nacht
  const breite = INSEL.u * 2, tiefe = INSEL.v1 - INSEL.v0, vMitte = (INSEL.v0 + INSEL.v1) / 2
  const VERSATZ = 40

  // Start: so nah, dass man die Laeden gut tippen kann; im Querformat passt fast die ganze Insel ins Bild.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    const ziel = new THREE.Vector3(...uv(0, 1.2, 1))
    cam.position.set(ziel.x + VERSATZ, ziel.y + VERSATZ, ziel.z + VERSATZ)
    cam.lookAt(ziel)
    const ganz = Math.min(size.width / (breite + 3), size.height / (tiefe * 0.577 + 7))
    const start = Math.max(ganz, Math.min(size.width, size.height) / 18)
    cam.zoom = start
    cam.updateProjectionMatrix()
    const s = steuerung.current
    if (s) { s.target.copy(ziel); s.minZoom = ganz * 0.9; s.maxZoom = Math.max(start * 2.4, 80); s.update() }
  }, [camera, size.width, size.height, breite, tiefe])

  // Schieben nur auf der Insel: Ziel zurueck auf Bodenhoehe holen und in die Inselgrenzen klemmen.
  const klemmen = () => {
    const s = steuerung.current
    if (!s) return
    const t = s.target
    const d = (t.y - 1) // entlang der Blickrichtung (1,1,1) zurueck auf y = 1
    let x = t.x - d, z = t.z - d
    let u = (x - z) * K, v = (x + z) * K
    u = Math.min(INSEL.u - 2, Math.max(-INSEL.u + 2, u))
    v = Math.min(INSEL.v1 - 2, Math.max(INSEL.v0 + 2, v))
    x = (u + v) * K; z = (v - u) * K
    t.set(x, 1, z)
    camera.position.set(x + VERSATZ, 1 + VERSATZ, z + VERSATZ)
  }

  const b = (ort: string) => p.beute[ort] ?? 0
  const sammle = (ort: string) => (wo: { x: number; y: number }) => p.onSammeln(ort, wo)
  const chip = (text: string, zahl?: React.ReactNode, klasse = '') => <div className={`wl-chip neutral ${klasse}`}><span>{text}</span>{zahl != null && <b>{zahl}</b>}</div>

  return (
    <>
      {/* Wasser */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}><planeGeometry args={[400, 400]} /><meshStandardMaterial color={nacht ? '#12314d' : '#2a86b8'} roughness={.35} metalness={.1} /></mesh>
      {/* Insel: am Bildschirm ausgerichtet (um 45 Grad gedreht) */}
      <group rotation={[0, Math.PI / 4, 0]}>
        <Kasten p={[0, -0.55, vMitte]} s={[breite + 1.6, 0.7, tiefe + 1.6]} r={0.3} mat={{ color: nacht ? '#8f8566' : '#ecdcae', roughness: 1 }} />
        <Kasten p={[0, -0.3, vMitte]} s={[breite, 0.6, tiefe]} r={0.25} mat={{ color: nacht ? '#2f5a45' : '#62b377', roughness: 1 }} />
        {/* Strasse quer + Wege */}
        <Kasten p={[0, 0.005, 3.7]} s={[breite - 1.2, 0.03, 1.5]} r={0.01} mat={{ color: '#4a4f5c', roughness: 1 }} />
        {Array.from({ length: Math.floor((breite - 3) / 1.6) }, (_, i) => (
          <Kasten key={i} p={[-(breite - 3) / 2 + 0.8 + i * 1.6, 0.025, 3.7]} s={[0.6, 0.01, 0.08]} mat={{ color: '#e8e2d4' }} />
        ))}
        <Kasten p={[0, 0.005, 2.65]} s={[1.3, 0.03, 0.75]} mat={{ color: '#cfc6b8', roughness: 1 }} />
        <Kasten p={[0, 0.005, -3.6]} s={[1.1, 0.03, 3.0]} mat={{ color: '#cfc6b8', roughness: 1 }} />
        <Kasten p={[0, 0.005, -5.2]} s={[12.5, 0.03, 0.9]} mat={{ color: '#cfc6b8', roughness: 1 }} />
        {/* Steg ins Wasser */}
        <Kasten p={[INSEL.u + 1.4, -0.12, 9.5]} s={[3.6, 0.14, 1.1]} mat={{ color: F.eiche, roughness: .9 }} />
      </group>

      <Zentrale etagen={p.etagen} level={p.level} nacht={nacht} beute={b('zentrale')} onRein={() => p.onAnsicht('haus')} onSammeln={sammle('zentrale')} />

      {kunden.map((k, i) => (
        <Laden key={k.id} k={k} i={i} position={uv(LADEN_PLAETZE[i][0], LADEN_PLAETZE[i][1])} aktiv={p.gewaehlt === `kunde:${k.id}`} nacht={nacht}
          beute={b(`kunde:${k.id}`)} onWaehlen={p.onWaehlen} onSammeln={sammle(`kunde:${k.id}`)} />
      ))}
      {frei && <FreiesGrundstueck position={uv(frei[0], frei[1])} onFrei={p.onFrei} />}

      {/* Die Agentur-Gebaeude hinter der Zentrale */}
      <Bau position={uv(0, -8.0)} hoehe={3.2 + Math.min(8, p.follower.marken) * 0.55} beute={b('turm')} onSammeln={sammle('turm')} onTipp={() => p.onOrt('ziele')}
        schild={chip('Sendeturm', p.follower.gesamt.toLocaleString('de-DE'))}>
        <Sendeturm marken={p.follower.marken} nacht={nacht} />
      </Bau>
      <Bau position={uv(-5.6, -6.8)} hoehe={2.6} beute={b('bank')} onSammeln={sammle('bank')} onTipp={() => p.onOrt('bilanz')} schild={chip('Bank', `${Math.round(p.umsatzMonat).toLocaleString('de-DE')} €`)}>
        <Bank nacht={nacht} />
      </Bau>
      <Bau position={uv(5.6, -6.8)} hoehe={2.4} aktiv={p.gewaehlt === 'ofen'} onTipp={() => p.onWaehlen(p.gewaehlt === 'ofen' ? null : 'ofen')} schild={chip('Backstube', p.leben.imOfen > 0 ? `${p.leben.imOfen} im Ofen` : undefined)}>
        <Backstube an={p.leben.imOfen > 0} nacht={nacht} />
      </Bau>
      <Bau position={uv(-10.8, -5.6)} hoehe={4.0} aktiv={p.gewaehlt === 'kalender'} onTipp={() => p.onWaehlen(p.gewaehlt === 'kalender' ? null : 'kalender')} schild={chip('Kalender')}>
        <Uhrturm />
      </Bau>
      <Bau position={uv(10.8, -5.6)} hoehe={1.4} aktiv={p.gewaehlt === 'pokale'} onTipp={() => p.onWaehlen(p.gewaehlt === 'pokale' ? null : 'pokale')} schild={chip('Hits', p.hits)}>
        <PokalPark hits={p.hits} />
      </Bau>
      <Bau position={uv(0, 6.6)} hoehe={1.8} beute={b('brett')} onSammeln={sammle('brett')} onTipp={() => p.onOrt('quests')} schild={chip('Quests', p.offeneQuests || undefined)}>
        <Brett zettel={p.offeneQuests} />
      </Bau>
      <Bau position={uv(0, 10.2)} hoehe={1.3} onTipp={() => p.onOrt('ziele')} schild={chip('Ziele', p.zielBereit ? '!' : undefined, p.zielBereit ? 'bereit' : '')}>
        <Truhe bereit={p.zielBereit} />
      </Bau>

      {/* Gruen, Felsen, Licht */}
      {([[-13, -10, 1], [13, -10, .9], [-13.2, 11, .9], [13, 11.2, 1], [-7.6, -10, 1.1], [7.4, -10.2, .9], [-13.4, -1.5, 1], [13.4, -2, 1.1], [-13.2, 5, .8], [13.3, 5.4, .9], [-6.5, 11.3, 1], [6.5, 11.3, 1.1], [-2.6, -10.4, .8], [3.0, -10.5, 1]] as const).map(([u, v, s], i) => (
        <Baum key={i} position={uv(u, v)} s={s} />
      ))}
      <Fels position={uv(-12.6, 8.6)} /><Fels position={uv(12.4, -7.8)} s={1.2} /><Fels position={uv(3.4, 11.6)} s={.8} />
      <Laterne position={uv(-2.6, 2.6)} nacht={nacht} /><Laterne position={uv(2.6, 2.6)} nacht={nacht} />
      <Laterne position={uv(-8.2, 4.9)} nacht={nacht} /><Laterne position={uv(8.2, 4.9)} nacht={nacht} />

      <OrbitControls
        ref={steuerung} makeDefault enableRotate={false} enablePan screenSpacePanning enableDamping={false} zoomSpeed={0.8} panSpeed={1}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        onChange={klemmen}
      />
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
        position={haus ? [6, 30, 18] : [14, 26, 6]} intensity={nacht ? .3 : 2.0} color={nacht ? '#9fb0ff' : '#fff1d6'} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.05}
        shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-near={1} shadow-camera-far={120}
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
      className={`st-buehne wl-buehne ${haus ? 'haus' : 'dorf'}`}
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
        <color attach="background" args={[haus ? (p.nacht ? '#0b0f2a' : '#101a33') : (p.nacht ? '#12314d' : '#2a86b8')]} />
        <Suspense fallback={null}>
          <Licht nacht={p.nacht} haus={haus} />
          {haus ? <Haus {...p} scroll={scroll} /> : <Dorf {...p} />}
        </Suspense>
      </Canvas>
    </div>
  )
}
