# Zoho-Mail an das Dashboard anbinden

Damit du Rechnungen direkt aus der App verschicken kannst **und** dein Posteingang
in der App erscheint. Einmal einrichten – dann läuft es.

> Wichtig: Wir speichern **kein** Passwort. Die Verbindung läuft über OAuth
> (offizieller Zoho-Weg mit einem widerrufbaren Token).

---

## 1. Zoho-App anlegen (holt Client-ID & Secret)

1. Geh auf **https://api-console.zoho.eu** (EU-Konto) und melde dich mit eurem
   Zoho-Konto an. *(Falls euer Zoho auf `.com` läuft: `https://api-console.zoho.com`.)*
2. **„Add Client"** → **„Self Client"** → **Create**.
3. Notiere dir **Client ID** und **Client Secret**.

## 2. Einmal-Token (Grant Code) erzeugen

1. In der Self-Client-Ansicht auf den Reiter **„Generate Code"**.
2. **Scope** eintragen (genau so, mit Komma):
   ```
   ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ
   ```
3. **Time Duration**: 10 Minuten. **Scope Description**: beliebig (z. B. „Dashboard").
   → **Create** → Konto/Adresse wählen → **Accept**.
4. Du bekommst einen **Code** (Grant Token). Der gilt nur ein paar Minuten – gleich weiter.

## 3. Grant Token → Refresh Token tauschen (einmalig)

Öffne ein Terminal (oder frag mich, ich gebe dir den fertigen Befehl mit deinen Werten)
und ersetze `CODE`, `CLIENT_ID`, `CLIENT_SECRET`:

```bash
curl -X POST "https://accounts.zoho.eu/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "code=CODE"
```

Aus der Antwort brauchst du den Wert **`refresh_token`** (langlebig, läuft nicht ab).

## 4. Secrets in Supabase setzen

Supabase → **Edge Functions → Secrets** → diese Werte anlegen:

| Name | Wert |
|------|------|
| `ZOHO_CLIENT_ID` | aus Schritt 1 |
| `ZOHO_CLIENT_SECRET` | aus Schritt 1 |
| `ZOHO_REFRESH_TOKEN` | aus Schritt 3 |
| `ZOHO_FROM_ADDRESS` | eure Absenderadresse, z. B. `rechnung@sowloynab.de` |
| `ZOHO_MAIL_BASE` | `https://mail.zoho.eu` *(nur bei `.com`-Konto: `https://mail.zoho.com`)* |
| `ZOHO_ACCOUNTS_BASE` | `https://accounts.zoho.eu` *(bzw. `.com`)* |

## 5. Funktionen deployen

```bash
supabase functions deploy mail-send
supabase functions deploy mail-sync
```

- **mail-send**: „Enforce JWT" **AN** lassen (nur eingeloggte dürfen senden).
- **mail-sync**: „Enforce JWT" **AUS** (der automatische Abruf ruft sie auf).

## 6. Datenbank & automatischer Abruf

1. `supabase/migrations/0013_mail.sql` im **SQL Editor** ausführen.
2. `supabase/functions/mail-sync/cron-setup.sql` anpassen (Projekt-Ref + Anon-Key)
   und ausführen → holt alle 5 Minuten neue Mails.

---

## Fertig – so nutzt du es

- **Rechnung senden**: Rechnungen → bei einer Rechnung auf **✉️ Senden** → Empfänger
  bestätigen → Senden. Die PDF hängt automatisch dran, die Mail liegt danach in eurem
  Zoho-„Gesendet".
- **Posteingang**: oben rechts das ✉️-Symbol (mit Zähler) oder **Mehr → Postfach**.
  Neue Mails kommen automatisch; mit **↻ Abrufen** holst du sofort.

Hakt etwas, schick mir die Fehlermeldung aus der App – die zeigt dir Zoho im Klartext.
