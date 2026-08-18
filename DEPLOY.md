# Deployment — Dashboard online stellen (GitHub Pages)

Alles läuft über **GitHub**, kein Drittanbieter. Ein GitHub-Actions-Workflow
(`.github/workflows/deploy.yml`) baut die App bei jedem Push automatisch und
veröffentlicht sie auf **GitHub Pages**.

Die Supabase-Zugänge liegen als Build-Werte in `.env.production` (der anon key
ist öffentlich und durch Row-Level-Security geschützt) — es sind **keine**
GitHub-Secrets nötig.

---

## Einmalig: GitHub Pages einschalten

1. Im Repo auf GitHub: **Settings → Pages**.
2. Unter **Build and deployment → Source**: **GitHub Actions** auswählen.

Das war's. Ab dann baut & veröffentlicht der Workflow bei jedem Push automatisch.

## Wo läuft der Build?

- Reiter **Actions** im Repo → dort siehst du jeden Lauf („Deploy zu GitHub Pages").
- Nach dem ersten grünen Lauf ist die App erreichbar unter:
  **https://loynabf-prog.github.io/SowLoynab-Dashboard/**

## Testen

Adresse öffnen → Login-Screen → mit dem in Supabase angelegten User einloggen
→ Dashboard. ✅

---

## Später: eigene Subdomain `app.sowloynab.de`

1. Repo **Settings → Pages → Custom domain**: `app.sowloynab.de` eintragen.
   (Legt eine `CNAME`-Datei an und stellt automatisch HTTPS bereit.)
2. Bei **INWX** einen **CNAME**-Eintrag setzen:
   - Host/Name: `app`
   - Ziel/Value: `loynabf-prog.github.io`
3. Sobald die Domain steht, muss der Unterpfad weg — dann setze ich `VITE_BASE`
   im Workflow auf `/` (bzw. entferne es), damit die App im Wurzelpfad läuft.

Der Login schützt alles — Fremde sehen nur den Anmelde-Screen.

---

## Auto-Deploy

Jeder Push auf `main` (oder den Arbeits-Branch) baut die Seite automatisch neu.
Kein manuelles Hochladen.

> Netlify/Vercel gehen mit den ebenfalls vorhandenen Configs (`netlify.toml`,
> `vercel.json`) genauso — werden aber nicht gebraucht, solange GitHub Pages läuft.
