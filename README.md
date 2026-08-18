# Sow & Loynab — Agentur-Dashboard

Internes CRM / Content-Board von **Sow & Loynab Media**. Kein öffentliches Marketing —
das ist unser eigenes Tool zum Verwalten aller Kunden und ihrer Videos (posten,
planen, Status verfolgen, Captions erzeugen).

> **Nicht** die Marketing-Website (sowloynab.de). Eigenes Repo, eigenes Hosting,
> geplante Subdomain `app.sowloynab.de`.

## Stack

- **Frontend:** React + Vite + TypeScript (schlank, kein Framework-Overkill)
- **Backend / DB / Auth / Realtime:** Supabase (Postgres, Auth, Row-Level-Security)
- **Video-Master:** Bunny Storage (verlustfrei) — *Anbindung folgt*
- **Captions:** Claude-API über Supabase Edge Function — *Anbindung folgt*

## Was jetzt schon läuft (v1-Grundgerüst)

- Helles, hochwertiges Creme-Design — optimiert für **Handy & PC** (responsive)
- **Als Web-App installierbar** (PWA): iPhone „Zum Home-Bildschirm" → öffnet wie eine App
- Team-Login (Supabase Auth, E-Mail/Passwort)
- Kunden-Dashboard als **Logo-Kacheln** (Logo groß, Name drunter) → Kundenseite
- Logo-Upload pro Kunde (Supabase Storage)
- Video-Board im Kanban-Stil: **Zu bearbeiten · Bereit zum Post · Geplant · Gepostet**
  (Status per Klick weiterschalten)
- Pro Video: Titel/Idee, Posting-**Datum + Uhrzeit**, Caption, Notizen, Häkchen
  „IG gepostet" / „TikTok gepostet"
- **Anstehende Posts** oben im Dashboard, fällige Posts hervorgehoben
- Live-Sync über Supabase Realtime (mehrere Leute gleichzeitig)
- Upload / Download / Auto-Caption sind als Buttons vorhanden, aber noch nicht
  verkabelt (kommt mit Bunny- + Claude-Anbindung). Echte Push-/Mail-Erinnerungen
  folgen mit dem Backend-Schritt.

## Einrichten (lokal)

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Zugänge eintragen

```bash
cp .env.example .env.local
```

Dann in `.env.local` die Werte aus dem Supabase-Dashboard
(*Project Settings → API*) eintragen:

```
VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

> Der `anon key` ist öffentlich (durch Row-Level-Security geschützt) und darf ins
> Frontend. Der `service_role`-Key gehört **niemals** hierher.

### 3. Datenbank aufsetzen

Im Supabase-Dashboard → **SQL Editor** → **nacheinander** einfügen und **Run**:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   — Tabellen, Status-Enum, RLS, Realtime.
2. [`supabase/migrations/0002_logos_planned_time.sql`](supabase/migrations/0002_logos_planned_time.sql)
   — Logo-Feld, Status „Geplant", Postingzeit, Logo-Storage-Bucket.

### 4. Team-Logins anlegen

Supabase-Dashboard → **Authentication → Users → Add user**. Für jedes
Team-Mitglied (Fassie, Lion, …) eine E-Mail + Passwort anlegen. *Selbst-Registrierung
ist bewusst nicht eingebaut* — nur wer angelegt wird, kommt rein.

### 5. Starten

```bash
npm run dev
```

→ http://localhost:5173

## Nützliche Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server mit Hot-Reload |
| `npm run build` | Produktions-Build (`dist/`) |
| `npm run preview` | Build lokal testen |
| `npm run typecheck` | TypeScript prüfen ohne Build |

## Datenmodell (Kurzfassung)

- **clients**: `name`, `handle_ig`, `handle_tiktok`, `notes`
- **videos**: `client_id`, `title`, `status` (todo/ready/posted), `scheduled_date`,
  `caption`, `notes`, `storage_path` (Bunny), `posted_ig`, `posted_tiktok`, …

RLS-Regel v1: jedes **eingeloggte** Team-Mitglied darf alles; anonyme Zugriffe
sind komplett gesperrt.

## Als Nächstes

1. **Bunny-Anbindung**: verlustfreier Upload (resumable) + Download der Originaldatei.
2. **Claude-Caption**: Edge Function, die aus einer Ein-Satz-Beschreibung Caption +
   Hashtags erzeugt (API-Key server-seitig).
3. Deploy (Netlify/Vercel) auf `app.sowloynab.de`.
