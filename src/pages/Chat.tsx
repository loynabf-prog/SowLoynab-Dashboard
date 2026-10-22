// Team-Chat.
// ---------------------------------------------------------------------------
// Links (bzw. auf dem Handy: zuerst) die Kanaele, rechts das Gespraech.
// Im Gespraech kann man mehr als Text:
//
//   /aufgabe @Lion Rechnung schreiben bis Freitag  -> echte Aufgabe + Karte
//   @claude was brennt diese Woche?                -> Claude antwortet hier
//
// Aufgaben-Karten lassen sich direkt im Verlauf abhaken. Schlaegt Claude vor,
// etwas anzulegen, kommt eine Plan-Karte -- ausgefuehrt wird erst auf Knopfdruck,
// unter dem angemeldeten Nutzer, mit derselben Logik wie im Assistenten.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowUp, Bot, Check, ChevronLeft, ListChecks, MessageCircle, Plus, Sparkles, Users, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'
import { useIdentity } from '../context/IdentityContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import {
  alsGelesen, claudeKanal, direktKanal, frageClaude, gruppeAnlegen, kanalName, ladeKanaele,
  ladeNachrichten, pushAnKanal, schreibe, sortiereKanaele, ungelesen,
  type Kanal, type Nachricht,
} from '../lib/chat'
import { BEFEHLE, datumAnzeige, deuteZeile } from '../lib/chatBefehl'
import { beschreibe, fuehreAus, pruefe, type Schritt } from '../lib/assistent'
import { heute as heuteIso } from '../lib/datum'

interface Aufgabe {
  id: string
  title: string
  done: boolean
  due_date: string | null
  due_time: string | null
  assignee_ids: string[] | null
  priority: number | null
}

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { members, byId } = useTeam()
  const { memberId, setMemberId } = useIdentity()
  const [kanaele, setKanaele] = useState<Kanal[]>([])
  const [zaehler, setZaehler] = useState<Record<string, number>>({})
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(true)
  const [neueGruppe, setNeueGruppe] = useState(false)

  const nameVon = useCallback((mid: string) => byId(mid)?.name, [byId])
  const aktive = members.filter((m) => m.active !== false)

  const laden = useCallback(async () => {
    try {
      const k = await ladeKanaele(memberId)
      setKanaele(k)
      if (memberId) setZaehler(await ungelesen(memberId))
      setFehler(null)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      setFehler(/does not exist|schema cache/i.test(msg)
        ? 'Der Chat ist noch nicht eingerichtet (Datenbank-Änderung 0050 fehlt).'
        : msg)
    } finally {
      setLaedt(false)
    }
  }, [memberId])

  useEffect(() => { laden() }, [laden])

  // Neue Kanaele / neue Nachrichten anderswo -> Liste und Zaehler auffrischen
  useEffect(() => {
    const ch = supabase
      .channel('chat-liste')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels' }, () => laden())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => laden())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [laden])

  const offen = id ? kanaele.find((k) => k.id === id) : undefined

  async function oeffneDirekt(anderer: string) {
    if (!memberId) return
    const k = await direktKanal(memberId, anderer)
    setKanaele((alt) => (alt.some((x) => x.id === k.id) ? alt : sortiereKanaele([...alt, k])))
    navigate(`/chat/${k.id}`)
  }
  async function oeffneClaude() {
    if (!memberId) return
    const k = await claudeKanal(memberId)
    setKanaele((alt) => (alt.some((x) => x.id === k.id) ? alt : sortiereKanaele([...alt, k])))
    navigate(`/chat/${k.id}`)
  }

  if (!memberId) {
    return (
      <div className="ch-wer">
        <MessageCircle size={36} strokeWidth={1.6} />
        <h2>Wer bist du auf diesem Gerät?</h2>
        <p className="muted">Damit die anderen sehen, von wem die Nachricht kommt.</p>
        <div className="ch-wer-opts">
          {aktive.map((m) => (
            <button key={m.id} className="btn" onClick={() => setMemberId(m.id)}>{m.name}</button>
          ))}
        </div>
      </div>
    )
  }

  // Wen gibt es noch nicht als Direktchat? Die bekommen in der Liste eine Zeile zum Starten.
  const ohneDirekt = aktive.filter((m) => m.id !== memberId
    && !kanaele.some((k) => k.kind === 'direkt' && k.member_ids.includes(m.id)))
  const hatClaude = kanaele.some((k) => k.kind === 'claude')

  return (
    <div className={`ch ${id ? 'ch-offen' : ''}`}>
      <aside className="ch-liste">
        <div className="ch-liste-kopf">
          <h1>Chat</h1>
          <button className="ch-rund" onClick={() => setNeueGruppe(true)} aria-label="Neue Gruppe" title="Neue Gruppe">
            <Users size={18} strokeWidth={2} />
          </button>
        </div>
        {fehler && <div className="error-box">{fehler}</div>}
        {laedt && kanaele.length === 0 && <div className="muted" style={{ padding: 16 }}>Lädt …</div>}
        <div className="n-gruppe">
          {kanaele.map((k) => {
            const n = zaehler[k.id] ?? 0
            const titel = kanalName(k, memberId, nameVon)
            return (
              <button key={k.id} className={`n-zeile ch-kanal ${k.id === id ? 'on' : ''}`} onClick={() => navigate(`/chat/${k.id}`)}>
                <KanalBild k={k} ich={memberId} />
                <span className="n-text">
                  <span className="n-titel">{titel}</span>
                  <span className="n-unter">{untertitel(k, members.length)}</span>
                </span>
                {n > 0 && <span className="ch-zahl">{n > 99 ? '99+' : n}</span>}
              </button>
            )
          })}
          {!hatClaude && (
            <button className="n-zeile ch-kanal" onClick={oeffneClaude}>
              <span className="ch-bild claude"><Sparkles size={18} /></span>
              <span className="n-text"><span className="n-titel">Claude</span><span className="n-unter">Fragen, planen, anlegen lassen</span></span>
            </button>
          )}
          {ohneDirekt.map((m) => (
            <button key={m.id} className="n-zeile ch-kanal" onClick={() => oeffneDirekt(m.id)}>
              <span className="ch-bild" style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
              <span className="n-text"><span className="n-titel">{m.name}</span><span className="n-unter">Direktnachricht schreiben</span></span>
            </button>
          ))}
        </div>
        <p className="ch-tipp">
          Tipp: <b>/aufgabe @Name … bis Freitag</b> legt eine Aufgabe an, <b>@claude</b> holt Claude dazu.
        </p>
      </aside>

      <section className="ch-gespraech">
        {offen ? (
          <Gespraech key={offen.id} kanal={offen} onGelesen={() => setZaehler((z) => ({ ...z, [offen.id]: 0 }))} />
        ) : (
          <div className="ch-leer">
            <MessageCircle size={40} strokeWidth={1.5} />
            <span>Wähl links einen Chat.</span>
          </div>
        )}
      </section>

      {neueGruppe && (
        <GruppeModal
          onClose={() => setNeueGruppe(false)}
          onFertig={(k) => { setNeueGruppe(false); setKanaele((alt) => sortiereKanaele([...alt, k])); navigate(`/chat/${k.id}`) }}
        />
      )}
    </div>
  )
}

function untertitel(k: Kanal, teamGroesse: number): string {
  if (k.kind === 'team') return `Alle · ${teamGroesse} Personen`
  if (k.kind === 'claude') return 'Fragen, planen, anlegen lassen'
  if (k.kind === 'gruppe') return `${k.member_ids.length} Personen`
  return 'Direktnachricht'
}

function KanalBild({ k, ich }: { k: Kanal; ich: string | null }) {
  const { byId } = useTeam()
  if (k.kind === 'team') return <span className="ch-bild team">S&amp;L</span>
  if (k.kind === 'claude') return <span className="ch-bild claude"><Sparkles size={18} /></span>
  if (k.kind === 'gruppe') return <span className="ch-bild gruppe"><Users size={17} /></span>
  const anderer = byId(k.member_ids.find((x) => x !== ich) ?? '')
  return <span className="ch-bild" style={{ background: anderer?.color ?? 'var(--text-dim)' }}>{(anderer?.name ?? '?').slice(0, 1)}</span>
}

// ---------------------------------------------------------------------------
// Ein Gespraech
// ---------------------------------------------------------------------------

function Gespraech({ kanal, onGelesen }: { kanal: Kanal; onGelesen: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { members, byId } = useTeam()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [liste, setListe] = useState<Nachricht[]>([])
  const [aufgaben, setAufgaben] = useState<Record<string, Aufgabe>>({})
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([])
  const [text, setText] = useState('')
  const [sendet, setSendet] = useState(false)
  const [claudeDenkt, setClaudeDenkt] = useState(false)
  const [mehrDa, setMehrDa] = useState(false)
  const [aufgabeOffen, setAufgabeOffen] = useState(false)
  const unten = useRef<HTMLDivElement>(null)
  const feld = useRef<HTMLTextAreaElement>(null)
  const bekannt = useRef<Set<string>>(new Set())

  const heute = heuteIso()
  const nameVon = useCallback((mid: string) => byId(mid)?.name, [byId])
  const titel = kanalName(kanal, memberId, nameVon)
  const personen = useMemo(() => members.filter((m) => m.active !== false).map((m) => ({ id: m.id, name: m.name })), [members])
  const alleIds = personen.map((p) => p.id)
  const ichName = memberId ? byId(memberId)?.name ?? 'Jemand' : 'Jemand'

  const ladeAufgaben = useCallback(async (ids: string[]) => {
    const neu = ids.filter(Boolean)
    if (neu.length === 0) return
    const { data } = await supabase.from('tasks').select('id, title, done, due_date, due_time, assignee_ids, priority').in('id', neu)
    setAufgaben((alt) => {
      const n = { ...alt }
      for (const a of (data ?? []) as Aufgabe[]) n[a.id] = a
      return n
    })
  }, [])

  const nachUnten = (sanft = true) =>
    requestAnimationFrame(() => unten.current?.scrollIntoView({ behavior: sanft ? 'smooth' : 'auto', block: 'end' }))

  // Erstes Laden
  useEffect(() => {
    let weg = false
    ladeNachrichten(kanal.id).then((n) => {
      if (weg) return
      n.forEach((x) => bekannt.current.add(x.id))
      setListe(n)
      setMehrDa(n.length >= 60)
      ladeAufgaben(n.map((x) => x.task_id ?? ''))
      nachUnten(false)
    })
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name')
      .then(({ data }) => setKunden((data ?? []) as { id: string; name: string }[]))
    return () => { weg = true }
  }, [kanal.id, ladeAufgaben])

  // Gelesen markieren, sobald man drin ist und wenn Neues kommt
  useEffect(() => {
    if (!memberId) return
    alsGelesen(kanal.id, memberId).then(onGelesen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanal.id, memberId, liste.length])

  // Live: neue und geaenderte Nachrichten, geaenderte Aufgaben
  useEffect(() => {
    const ch = supabase
      .channel(`chat-${kanal.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${kanal.id}` }, (p) => {
        const n = p.new as Nachricht
        if (n.author_kind === 'claude') setClaudeDenkt(false)
        if (bekannt.current.has(n.id)) return
        bekannt.current.add(n.id)
        setListe((alt) => [...alt, n])
        if (n.task_id) ladeAufgaben([n.task_id])
        nachUnten()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${kanal.id}` }, (p) => {
        const n = p.new as Nachricht
        setListe((alt) => (n.deleted_at ? alt.filter((x) => x.id !== n.id) : alt.map((x) => (x.id === n.id ? n : x))))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (p) => {
        const a = p.new as Aufgabe
        setAufgaben((alt) => (alt[a.id] ? { ...alt, [a.id]: { ...alt[a.id], ...a } } : alt))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [kanal.id, ladeAufgaben])

  async function frueher() {
    const erste = liste[0]
    if (!erste) return
    const n = await ladeNachrichten(kanal.id, erste.created_at)
    n.forEach((x) => bekannt.current.add(x.id))
    setListe((alt) => [...n, ...alt])
    setMehrDa(n.length >= 60)
    ladeAufgaben(n.map((x) => x.task_id ?? ''))
  }

  function eigene(n: Nachricht) {
    bekannt.current.add(n.id)
    setListe((alt) => [...alt, n])
    nachUnten()
  }

  async function aufgabeAnlegen(a: { titel: string; wer: string[]; datum: string | null; uhrzeit: string | null; prioritaet: number }, zeile: string) {
    // Im Direktchat ohne @Name: die Aufgabe ist fuer den anderen
    let wer = a.wer
    if (wer.length === 0 && kanal.kind === 'direkt') wer = kanal.member_ids.filter((x) => x !== memberId)
    const { data, error } = await supabase.from('tasks').insert({
      title: a.titel, done: false, due_date: a.datum, due_time: a.uhrzeit, priority: a.prioritaet,
      assignee_ids: wer, created_by: user?.id ?? null,
    }).select('id, title, done, due_date, due_time, assignee_ids, priority').single()
    if (error) throw error
    const auf = data as Aufgabe
    setAufgaben((alt) => ({ ...alt, [auf.id]: auf }))
    const n = await schreibe({ channel_id: kanal.id, author_id: memberId, body: zeile, task_id: auf.id })
    eigene(n)
    const wen = wer.map((x) => byId(x)?.name).filter(Boolean).join(', ')
    const wann = a.datum ? ` · ${datumAnzeige(a.datum, heute)}${a.uhrzeit ? ` ${a.uhrzeit}` : ''}` : ''
    pushAnKanal({
      kanal, alleIds, absender: memberId, nur: wer.length ? wer : undefined,
      titel: `✅ Neue Aufgabe von ${ichName}`,
      text: `${a.titel}${wann}${wen && wer.length > 1 ? ` (für ${wen})` : ''}`,
    })
  }

  async function senden(zeileRoh?: string) {
    const zeile = (zeileRoh ?? text).trim()
    if (!zeile || sendet) return
    setSendet(true)
    try {
      const b = deuteZeile(zeile, personen, heute)
      if (b.art === 'aufgabe') {
        if (!b.titel) { toast('Was ist die Aufgabe? z. B. /aufgabe @Lion Rechnung schreiben bis Freitag'); return }
        await aufgabeAnlegen(b, zeile)
      } else {
        const n = await schreibe({ channel_id: kanal.id, author_id: memberId, body: zeile })
        eigene(n)
        // Im Claude-Chat geht jede Nachricht an Claude -- dann braucht es keinen Push an andere.
        if (kanal.kind !== 'claude') {
          pushAnKanal({ kanal, alleIds, absender: memberId, titel: kanal.kind === 'direkt' ? ichName : `${ichName} · ${titel}`, text: zeile })
        }
        if (b.art === 'claude' || kanal.kind === 'claude') {
          setClaudeDenkt(true)
          nachUnten()
          frageClaude(kanal.id, memberId, b.art === 'claude' ? b.frage || zeile : zeile, heute)
            .catch((e) => { setClaudeDenkt(false); toast('Claude: ' + (e as Error).message) })
        }
      }
      setText('')
      if (feld.current) feld.current.style.height = ''
    } catch (e) {
      toast('Senden fehlgeschlagen: ' + (e as Error).message)
    } finally {
      setSendet(false)
      feld.current?.focus()
    }
  }

  async function abhaken(a: Aufgabe) {
    const done = !a.done
    setAufgaben((alt) => ({ ...alt, [a.id]: { ...a, done } }))
    const { error } = await supabase.from('tasks').update({ done }).eq('id', a.id)
    if (error) { toast(error.message); setAufgaben((alt) => ({ ...alt, [a.id]: a })); return }
    if (done) {
      const n = await schreibe({ channel_id: kanal.id, author_id: memberId, author_kind: 'system', body: `${ichName} hat „${a.title}" erledigt` })
      eigene(n)
      pushAnKanal({ kanal, alleIds, absender: memberId, titel: `✔︎ ${ichName} hat erledigt`, text: a.title })
    }
  }

  // --- Eingabe: Vorschlaege fuer / und @ ---
  const wortAmEnde = text.match(/(^|\s)([/@][^\s]*)$/)?.[2] ?? ''
  const vorschlaege: { label: string; neu: string; hinweis?: string }[] = []
  if (wortAmEnde.startsWith('/') && text.trim() === wortAmEnde) {
    for (const b of BEFEHLE) if (b.kurz.startsWith(wortAmEnde.toLowerCase())) vorschlaege.push({ label: b.kurz, neu: `${b.kurz} `, hinweis: b.text })
  } else if (wortAmEnde.startsWith('@')) {
    const q = wortAmEnde.slice(1).toLowerCase()
    const davor = text.slice(0, text.length - wortAmEnde.length)
    for (const p of [...personen.filter((x) => x.id !== memberId), { id: 'claude', name: 'claude' }]) {
      if (p.name.toLowerCase().startsWith(q)) vorschlaege.push({ label: `@${p.name}`, neu: `${davor}@${p.name} `, hinweis: p.id === 'claude' ? 'Claude fragen' : undefined })
    }
  }

  function kundenName(b: { client_id?: string | null; client_ref?: string | null }, plan: Schritt[]): string {
    if (b.client_id) return kunden.find((k) => k.id === b.client_id)?.name ?? 'diesen Kunden'
    if (b.client_ref) {
      const neu = plan.find((s) => s.art === 'kunde_anlegen' && (s as { ref?: string }).ref === b.client_ref) as { name?: string } | undefined
      return neu?.name ? `„${neu.name}"` : 'den neuen Kunden'
    }
    return 'ohne Kunde'
  }

  async function planAusfuehren(n: Nachricht) {
    if (!n.plan?.length) return
    const fehlerListe = pruefe(n.plan)
    if (fehlerListe.length) { toast(fehlerListe[0]); return }
    setListe((alt) => alt.map((x) => (x.id === n.id ? { ...x, plan_status: 'laeuft' } : x)))
    await supabase.from('chat_messages').update({ plan_status: 'laeuft' }).eq('id', n.id)
    const r = await fuehreAus(n.plan, user?.id ?? null)
    const ok = r.filter((x) => x.ok).length
    await supabase.from('chat_messages').update({ plan_status: 'ausgefuehrt', plan_result: r }).eq('id', n.id)
    setListe((alt) => alt.map((x) => (x.id === n.id ? { ...x, plan_status: 'ausgefuehrt', plan_result: r } : x)))
    const s = await schreibe({
      channel_id: kanal.id, author_id: memberId, author_kind: 'system',
      body: `${ichName} hat Claudes Plan ausgeführt: ${ok} von ${n.plan.length} Schritten erledigt${ok < r.length || ok < n.plan.length ? ' – beim ersten Fehler abgebrochen' : ''}`,
    })
    eigene(s)
  }

  async function planVerwerfen(n: Nachricht) {
    setListe((alt) => alt.map((x) => (x.id === n.id ? { ...x, plan_status: 'verworfen' } : x)))
    await supabase.from('chat_messages').update({ plan_status: 'verworfen' }).eq('id', n.id)
  }

  return (
    <div className="ch-g">
      <header className="ch-g-kopf">
        <button className="ch-zurueck" onClick={() => navigate('/chat')} aria-label="Zurück"><ChevronLeft size={24} /></button>
        <KanalBild k={kanal} ich={memberId} />
        <div className="ch-g-titel">
          <strong>{titel}</strong>
          <span>{kanal.kind === 'claude' ? 'Kennt Kunden, Aufgaben und den Plan' : kanal.kind === 'team' ? 'Alle im Team' : kanal.kind === 'gruppe' ? kanal.member_ids.map((x) => byId(x)?.name).filter(Boolean).join(', ') : 'Direktnachricht'}</span>
        </div>
      </header>

      <div className="ch-verlauf">
        {mehrDa && <button className="btn btn-sm btn-ghost ch-frueher" onClick={frueher}>Frühere Nachrichten</button>}
        {liste.length === 0 && (
          <div className="ch-start">
            {kanal.kind === 'claude' ? (
              <>
                <Sparkles size={28} />
                <p>Frag mich was zu Kunden, Posts und Aufgaben – oder sag, was ich anlegen soll. Du siehst immer erst den Plan.</p>
                {['Was brennt diese Woche?', 'Welche Aufgaben hat Lion offen?', 'Leg für Lion eine Aufgabe an: Drehplan BelChicken bis Montag'].map((b) => (
                  <button key={b} className="as-beispiel" onClick={() => senden(b)}>{b}</button>
                ))}
              </>
            ) : (
              <p className="muted">Noch keine Nachrichten. Schreib die erste – oder leg mit <b>/aufgabe</b> direkt was an.</p>
            )}
          </div>
        )}

        {liste.map((n, i) => {
          const vorher = liste[i - 1]
          const neuerTag = !vorher || vorher.created_at.slice(0, 10) !== n.created_at.slice(0, 10)
          const gleicherAbsender = !neuerTag && vorher && vorher.author_id === n.author_id && vorher.author_kind === n.author_kind
            && new Date(n.created_at).getTime() - new Date(vorher.created_at).getTime() < 5 * 60_000
          const ich = n.author_kind === 'mensch' && n.author_id === memberId
          const autor = n.author_kind === 'claude' ? 'Claude' : n.author_id ? byId(n.author_id)?.name ?? 'Jemand' : ''
          const auf = n.task_id ? aufgaben[n.task_id] : undefined
          return (
            <div key={n.id}>
              {neuerTag && <div className="ch-tag">{tagLabel(n.created_at)}</div>}
              {n.author_kind === 'system' ? (
                <div className="ch-system">{n.body}</div>
              ) : (
                <div className={`ch-msg ${ich ? 'ich' : ''} ${n.author_kind === 'claude' ? 'claude' : ''} ${gleicherAbsender ? 'folge' : ''}`}>
                  {!ich && !gleicherAbsender && kanal.kind !== 'direkt' && (
                    <div className="ch-autor">
                      {n.author_kind === 'claude' ? <Sparkles size={12} /> : null}{autor}
                    </div>
                  )}
                  {auf ? (
                    <AufgabeKarte a={auf} heute={heute} wer={(auf.assignee_ids ?? []).map((x) => byId(x)?.name).filter(Boolean) as string[]} onToggle={() => abhaken(auf)} ich={ich} />
                  ) : (
                    <div className="ch-blase">
                      <Text text={n.body} />
                      <span className="ch-zeit">{zeit(n.created_at)}</span>
                    </div>
                  )}
                  {n.plan && n.plan.length > 0 && (
                    <PlanKarte n={n} kundenName={(b) => kundenName(b, n.plan ?? [])} onAus={() => planAusfuehren(n)} onWeg={() => planVerwerfen(n)} />
                  )}
                  {n.link && <button className="btn btn-sm ch-link" onClick={() => navigate(n.link!)}>Öffnen →</button>}
                </div>
              )}
            </div>
          )
        })}

        {claudeDenkt && (
          <div className="ch-msg claude">
            <div className="ch-autor"><Sparkles size={12} />Claude</div>
            <div className="ch-blase ch-tippt"><span /><span /><span /></div>
          </div>
        )}
        <div ref={unten} />
      </div>

      <footer className="ch-eingabe">
        {vorschlaege.length > 0 && (
          <div className="ch-vorschlaege">
            {vorschlaege.map((v) => (
              <button key={v.label} onMouseDown={(e) => { e.preventDefault(); setText(v.neu); feld.current?.focus() }}>
                <b>{v.label}</b>{v.hinweis && <span>{v.hinweis}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="ch-eingabe-zeile">
          <button className="ch-rund" onClick={() => setAufgabeOffen(true)} aria-label="Aufgabe zuweisen" title="Aufgabe zuweisen">
            <ListChecks size={19} />
          </button>
          <textarea
            ref={feld}
            rows={1}
            value={text}
            placeholder={kanal.kind === 'claude' ? 'Frag Claude …' : 'Nachricht, /aufgabe oder @claude'}
            onChange={(e) => {
              setText(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); senden() }
            }}
          />
          <button className="ch-senden" onClick={() => senden()} disabled={!text.trim() || sendet} aria-label="Senden">
            <ArrowUp size={19} strokeWidth={2.6} />
          </button>
        </div>
      </footer>

      {aufgabeOffen && (
        <AufgabeModal
          kanal={kanal}
          onClose={() => setAufgabeOffen(false)}
          onSenden={async (a) => {
            setAufgabeOffen(false)
            const wen = a.wer.map((x) => byId(x)?.name).filter(Boolean).map((x) => `@${x}`).join(' ')
            const wann = a.datum ? ` (${datumAnzeige(a.datum, heute)}${a.uhrzeit ? ` ${a.uhrzeit}` : ''})` : ''
            try { await aufgabeAnlegen(a, `/aufgabe ${wen ? wen + ' ' : ''}${a.titel}${wann}`) } catch (e) { toast((e as Error).message) }
          }}
        />
      )}
    </div>
  )
}

function AufgabeKarte({ a, heute, wer, onToggle, ich }: { a: Aufgabe; heute: string; wer: string[]; onToggle: () => void; ich: boolean }) {
  const ueberfaellig = !a.done && a.due_date && a.due_date < heute
  return (
    <div className={`ch-aufgabe ${a.done ? 'fertig' : ''} ${ich ? 'ich' : ''}`}>
      <button className="ch-haken" onClick={onToggle} aria-label={a.done ? 'Wieder öffnen' : 'Erledigt'}>
        {a.done && <Check size={15} strokeWidth={3} />}
      </button>
      <div className="ch-aufgabe-text">
        <span className="ch-aufgabe-label">Aufgabe{a.priority === 3 ? ' · dringend' : a.priority === 2 ? ' · wichtig' : ''}</span>
        <strong>{a.title}</strong>
        <span className={`ch-aufgabe-meta ${ueberfaellig ? 'rot' : ''}`}>
          {wer.length ? `für ${wer.join(', ')}` : 'für alle'}
          {a.due_date && ` · ${datumAnzeige(a.due_date, heute)}${a.due_time ? ` ${a.due_time.slice(0, 5)}` : ''}`}
        </span>
      </div>
    </div>
  )
}

function PlanKarte({ n, kundenName, onAus, onWeg }: {
  n: Nachricht
  kundenName: (b: { client_id?: string | null; client_ref?: string | null }) => string
  onAus: () => void
  onWeg: () => void
}) {
  const plan = n.plan ?? []
  const status = n.plan_status ?? 'offen'
  return (
    <div className={`ch-plan ${status}`}>
      <div className="ch-plan-kopf"><Bot size={14} /> {status === 'ausgefuehrt' ? 'Ausgeführt' : status === 'verworfen' ? 'Verworfen' : 'Vorschlag – noch nichts passiert'}</div>
      <ol>
        {plan.map((s, i) => {
          const r = n.plan_result?.[i]
          return (
            <li key={i} className={r ? (r.ok ? 'ok' : 'kaputt') : ''}>
              {r ? r.text : beschreibe(s, kundenName)}
            </li>
          )
        })}
      </ol>
      {status === 'offen' && (
        <div className="ch-plan-knoepfe">
          <button className="btn btn-sm btn-ghost" onClick={onWeg}><X size={14} /> Verwerfen</button>
          <button className="btn btn-sm btn-primary" onClick={onAus}><Check size={14} /> {plan.length === 1 ? 'Ausführen' : `${plan.length} Schritte ausführen`}</button>
        </div>
      )}
      {status === 'laeuft' && <div className="muted" style={{ fontSize: 13 }}>Legt an …</div>}
    </div>
  )
}

function AufgabeModal({ kanal, onClose, onSenden }: {
  kanal: Kanal
  onClose: () => void
  onSenden: (a: { titel: string; wer: string[]; datum: string | null; uhrzeit: string | null; prioritaet: number }) => void
}) {
  const { members } = useTeam()
  const { memberId } = useIdentity()
  const moeglich = members.filter((m) => m.active !== false && (kanal.member_ids.length === 0 || kanal.member_ids.includes(m.id)))
  const vorwahl = kanal.kind === 'direkt' ? kanal.member_ids.filter((x) => x !== memberId) : []
  const [titel, setTitel] = useState('')
  const [wer, setWer] = useState<string[]>(vorwahl)
  const [datum, setDatum] = useState('')
  const [uhrzeit, setUhrzeit] = useState('')
  const [prio, setPrio] = useState(1)
  const heute = heuteIso()

  return (
    <Modal title="Aufgabe zuweisen" onClose={onClose}>
      <div className="stack">
        <div>
          <label>Was? *</label>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Rechnung Kebab Kumpels schreiben" autoFocus />
        </div>
        <div>
          <label>Für wen?</label>
          <div className="ch-chips">
            {moeglich.map((m) => (
              <button key={m.id} type="button" className={wer.includes(m.id) ? 'on' : ''}
                onClick={() => setWer((w) => (w.includes(m.id) ? w.filter((x) => x !== m.id) : [...w, m.id]))}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Bis wann?</label>
          <div className="ch-chips">
            {[['Heute', heute], ['Morgen', datumPlusTage(heute, 1)], ['In einer Woche', datumPlusTage(heute, 7)]].map(([l, d]) => (
              <button key={l} type="button" className={datum === d ? 'on' : ''} onClick={() => setDatum(datum === d ? '' : d)}>{l}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            <input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} style={{ maxWidth: 130 }} />
          </div>
        </div>
        <div>
          <label>Wie dringend?</label>
          <div className="ch-chips">
            {[[1, 'Normal'], [2, 'Wichtig'], [3, 'Dringend']].map(([p, l]) => (
              <button key={p} type="button" className={prio === p ? 'on' : ''} onClick={() => setPrio(p as number)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!titel.trim()}
            onClick={() => onSenden({ titel: titel.trim(), wer, datum: datum || null, uhrzeit: uhrzeit || null, prioritaet: prio })}>
            In den Chat
          </button>
        </div>
      </div>
    </Modal>
  )
}

function GruppeModal({ onClose, onFertig }: { onClose: () => void; onFertig: (k: Kanal) => void }) {
  const { members } = useTeam()
  const { memberId } = useIdentity()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [wer, setWer] = useState<string[]>([])
  const andere = members.filter((m) => m.active !== false && m.id !== memberId)

  async function anlegen() {
    if (!memberId || !name.trim()) return
    try { onFertig(await gruppeAnlegen(name, wer, memberId)) } catch (e) { toast((e as Error).message) }
  }

  return (
    <Modal title="Neue Gruppe" onClose={onClose}>
      <div className="stack">
        <div>
          <label>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Schnitt, Kebab Kumpels, Akquise" autoFocus />
        </div>
        <div>
          <label>Wer ist drin? <span className="muted">(du automatisch)</span></label>
          <div className="ch-chips">
            {andere.map((m) => (
              <button key={m.id} type="button" className={wer.includes(m.id) ? 'on' : ''}
                onClick={() => setWer((w) => (w.includes(m.id) ? w.filter((x) => x !== m.id) : [...w, m.id]))}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={anlegen} disabled={!name.trim()}><Plus size={15} /> Anlegen</button>
        </div>
      </div>
    </Modal>
  )
}

/** Text mit klickbaren Links und hervorgehobenen @Namen. */
function Text({ text }: { text: string }) {
  // Claude schreibt gern **fett** -- das soll im Chat auch fett aussehen.
  const teile = text.split(/(https?:\/\/\S+|@[\p{L}\p{N}_-]+|\*\*[^*\n]+\*\*)/u)
  return (
    <span className="ch-text">
      {teile.map((t, i) =>
        /^https?:\/\//.test(t) ? <a key={i} href={t} target="_blank" rel="noreferrer">{t}</a>
          : /^\*\*[^*\n]+\*\*$/.test(t) ? <strong key={i}>{t.slice(2, -2)}</strong>
            : t.startsWith('@') ? <b key={i}>{t}</b>
              : <span key={i}>{t}</span>,
      )}
    </span>
  )
}

function zeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
}

function tagLabel(iso: string): string {
  const d = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
  const h = heuteIso()
  if (d === h) return 'Heute'
  if (d === datumPlusTage(h, -1)) return 'Gestern'
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })
}

function datumPlusTage(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}
