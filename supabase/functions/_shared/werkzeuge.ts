// Gemeinsame Werkzeuge fuer den Assistenten und Claude im Team-Chat.
// Beide planen nur -- ausgefuehrt wird in der App (lib/assistent.ts).

// Die Werkzeuge, die der Assistent hat. Bewusst wenige und grob geschnitten:
// je naeher ein Werkzeug an dem liegt, was ein Mensch sagen wuerde, desto
// seltener setzt es die Maschine falsch zusammen.
export const WERKZEUGE = [
  {
    name: 'kunde_anlegen',
    description: 'Legt einen neuen Kunden an. Nur benutzen, wenn der Kunde noch NICHT in der Liste der bekannten Kunden steht.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Kurzer Platzhalter wie "k1", auf den spätere Schritte verweisen.' },
        name: { type: 'string' },
        honorar: { type: ['number', 'null'], description: 'Monatliches Honorar in Euro.' },
        videos_pro_monat: { type: ['number', 'null'] },
        marke: { type: ['string', 'null'], enum: ['media', 'creator', null], description: 'media = Unternehmen, creator = Personenmarke. Im Zweifel media.' },
        kundenart: { type: ['string', 'null'], enum: ['zahlend', 'referenz', 'passiv', null] },
        instagram: { type: ['string', 'null'] },
        tiktok: { type: ['string', 'null'] },
        stadt: { type: ['string', 'null'] },
      },
      required: ['ref', 'name'],
    },
  },
  {
    name: 'monatsplan',
    description: 'Legt die Videokarten eines ganzen Monats an, gleichmäßig verteilt. Das ist der Normalfall für "so und so viele Videos im Monat".',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'], description: 'Id eines bekannten Kunden.' },
        client_ref: { type: ['string', 'null'], description: 'Platzhalter aus einem kunde_anlegen-Schritt.' },
        monat: { type: 'string', description: 'Format YYYY-MM.' },
        anzahl: { type: 'number' },
        abstand: { type: ['number', 'null'], description: 'Tage zwischen zwei Posts. Weglassen = passend zur Menge rechnen.' },
        start_tag: { type: ['number', 'null'], description: 'Tag im Monat, an dem begonnen wird. Standard 1.' },
        auslassen: { type: ['array', 'null'], items: { type: 'number' }, description: 'Tage im Monat, an denen NICHT gepostet wird.' },
        uhrzeit: { type: ['string', 'null'], description: 'HH:MM' },
      },
      required: ['monat', 'anzahl'],
    },
  },
  {
    name: 'video_anlegen',
    description: 'Ein einzelnes Video an einem Tag. Für den Monatsrhythmus stattdessen monatsplan nehmen.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        titel: { type: 'string' },
        datum: { type: 'string', description: 'YYYY-MM-DD' },
        uhrzeit: { type: ['string', 'null'] },
      },
      required: ['titel', 'datum'],
    },
  },
  {
    name: 'video_absagen',
    description: 'Legt die Videos eines Kunden an einem bestimmten Tag in den Papierkorb. Für "an dem Tag posten wir doch nicht".',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        datum: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['datum'],
    },
  },
  {
    name: 'kunde_aendern',
    description: 'Ändert Felder eines bestehenden Kunden, z. B. Honorar oder Videomenge.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        felder: {
          type: 'object',
          description: 'Nur erlaubte Spalten: monthly_fee, monthly_quota, city, phone, email, website, contact_person, notes, brand, client_type.',
        },
      },
      required: ['felder'],
    },
  },
  {
    name: 'aufgabe_anlegen',
    description: 'Eine To-do-Aufgabe. Optional mit Kunde, Datum, Uhrzeit und Zuständigem.',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        datum: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        uhrzeit: { type: ['string', 'null'] },
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        wer: { type: ['array', 'null'], items: { type: 'string' }, description: 'Ids aus der Teamliste. Leer = alle.' },
      },
      required: ['titel'],
    },
  },
  {
    name: 'lead_anlegen',
    description: 'Ein Interessent, der noch kein Kunde ist. Für "neuer Lead", "Kontakt", "da waren wir im Gespräch". Mehrere Leads = mehrere Aufrufe.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: ['string', 'null'], description: 'Platzhalter wie "l1", falls ein späterer Schritt darauf verweist.' },
        name: { type: 'string', description: 'Name des Betriebs.' },
        stand: {
          type: ['string', 'null'],
          enum: ['new', 'contacted', 'talking', 'offer', 'won', 'lost', null],
          description: 'Wie weit man ist: new=noch nichts, contacted=angeschrieben/angerufen, talking=im Gespräch, offer=Angebot raus, won=gewonnen, lost=abgesagt.',
        },
        ansprechpartner: { type: ['string', 'null'] },
        telefon: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        instagram: { type: ['string', 'null'] },
        stadt: { type: ['string', 'null'] },
        potenzial: { type: ['number', 'null'], description: 'Mögliches Honorar pro Monat in Euro.' },
        naechster_schritt: { type: ['string', 'null'], description: 'Datum YYYY-MM-DD für die nächste Nachfassung.' },
        notiz: { type: ['string', 'null'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'lead_aendern',
    description: 'Ändert einen bestehenden Lead, meist den Stand ("bei dem sind wir jetzt im Gespräch").',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: ['string', 'null'] },
        lead_ref: { type: ['string', 'null'] },
        stand: { type: ['string', 'null'], enum: ['new', 'contacted', 'talking', 'offer', 'won', 'lost', null] },
        felder: { type: ['object', 'null'], description: 'Weitere Spalten: potential_fee, next_followup, notes, phone, email, city, contact_person.' },
      },
    },
  },
  {
    name: 'idee_anlegen',
    description: 'Eine Videoidee in den Ideenspeicher eines Kunden — noch kein Termin, nur gemerkt.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        titel: { type: 'string' },
        notiz: { type: ['string', 'null'] },
      },
      required: ['titel'],
    },
  },
  {
    name: 'profilbild_holen',
    description: 'Holt das öffentliche Profilbild zu einem Handle und setzt es als Logo des Kunden. Nach kunde_anlegen aufrufen, wenn ein Handle genannt wurde.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        plattform: { type: 'string', enum: ['instagram', 'tiktok'] },
        handle: { type: 'string', description: 'Ohne @.' },
      },
      required: ['plattform', 'handle'],
    },
  },
  {
    name: 'caption_schreiben',
    description: 'Schreibt eine Caption im Hausstil und speichert sie am Video oder an der Idee. Die festen Hashtags hängt die App selbst an.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: ['string', 'null'] },
        client_ref: { type: ['string', 'null'] },
        beschreibung: { type: 'string', description: 'Was im Video passiert — ein bis zwei Sätze.' },
        ziel: { type: ['string', 'null'], enum: ['video', 'idee', null], description: 'Wo die Caption hin soll. Standard: das genannte Video, sonst die zuletzt angelegte Idee.' },
        titel: { type: ['string', 'null'], description: 'Titel des gemeinten Videos, falls genannt.' },
        datum: { type: ['string', 'null'], description: 'YYYY-MM-DD des gemeinten Videos, falls genannt.' },
        extra: { type: ['string', 'null'], description: 'Einmaliger Zusatzwunsch, z. B. "Aktion erwähnen".' },
      },
      required: ['beschreibung'],
    },
  },
  {
    name: 'termin_anlegen',
    description: 'Arbeitszeit, Spiel oder sonstiger Termin — alles, was den Tag belegt, aber kein Video und keine Aufgabe ist.',
    input_schema: {
      type: 'object',
      properties: {
        titel: { type: 'string' },
        kind: { type: 'string', enum: ['arbeit', 'spiel', 'termin'] },
        von: { type: 'string', description: 'YYYY-MM-DD' },
        bis: { type: ['string', 'null'], description: 'YYYY-MM-DD, nur bei mehrtägig.' },
        ab: { type: ['string', 'null'], description: 'HH:MM. Ohne Zeiten = ganztägig.' },
        bis_zeit: { type: ['string', 'null'], description: 'HH:MM' },
        wer: { type: ['array', 'null'], items: { type: 'string' }, description: 'Ids aus der Teamliste. Leer = gilt für alle.' },
      },
      required: ['titel', 'kind', 'von'],
    },
  },
]
