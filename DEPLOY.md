# Deployment — Dashboard online stellen

Ziel: aus dem GitHub-Repo eine echte, aufrufbare Web-App machen — kostenlos,
mit automatischem Neu-Deploy bei jedem Push.

Empfohlen: **Netlify** (die Konfig `netlify.toml` liegt schon im Repo).
Vercel geht genauso (`vercel.json` ist auch dabei).

---

## Schritt 1 — Bei Netlify mit GitHub anmelden

1. Auf **[netlify.com](https://netlify.com)** → **Sign up** → **GitHub** wählen.
2. Zugriff auf das Repo `loynabf-prog/SowLoynab-Dashboard` erlauben.

## Schritt 2 — Neues Projekt aus dem Repo

1. **Add new site → Import an existing project → GitHub**.
2. Repo `SowLoynab-Dashboard` auswählen.
3. **Branch:** vorerst `claude/briefing-64sk0p` (oder `main`, sobald gemerged).
4. Build-Einstellungen erkennt Netlify automatisch aus `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

## Schritt 3 — Zugänge (Environment Variables) eintragen ⚠️ WICHTIG

Ohne diese zwei Werte baut die App, aber der Login funktioniert nicht
(die `.env.local` liegt bewusst NICHT im Repo).

In Netlify: **Site configuration → Environment variables → Add a variable**:

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://kxrbeyecsdvejhvxtrin.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (der anon key aus Supabase → Project Settings → API) |

Danach **Deploy site** (bzw. „Trigger deploy", falls schon gebaut).

## Schritt 4 — Testen

Netlify gibt dir eine Adresse wie `https://zufallsname.netlify.app`.
Öffnen → Login-Screen → mit dem angelegten User einloggen → Dashboard. ✅

---

## Schritt 5 — Eigene Subdomain `app.sowloynab.de` (später)

1. In Netlify: **Domain management → Add a custom domain** → `app.sowloynab.de`.
2. Bei **INWX** (wo die Domain liegt) einen **CNAME**-Eintrag setzen:
   - Host/Name: `app`
   - Ziel/Value: die von Netlify angezeigte Adresse (z. B. `zufallsname.netlify.app`)
3. Netlify stellt automatisch ein kostenloses HTTPS-Zertifikat aus.

Fertig: `https://app.sowloynab.de` zeigt das Dashboard. Der Login schützt es —
Fremde sehen nur den Anmelde-Screen.

---

## Auto-Deploy

Ab jetzt gilt: **jeder Push auf den verbundenen Branch** baut die Seite
automatisch neu. Kein manuelles Hochladen mehr.
