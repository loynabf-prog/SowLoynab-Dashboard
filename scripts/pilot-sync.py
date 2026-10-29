# Erzeugt supabase/functions/pilot-push/pilot.ts aus src/lib/pilot.ts:
# dieselbe Logik fuer Deno, nur die zwei Imports sind inline.
import pathlib

quelle = pathlib.Path('src/lib/pilot.ts').read_text()
imports = "import { datumPlus } from './datum'\nimport { artVon, rangVon } from './kundenart'\n"
assert imports in quelle, 'Imports in src/lib/pilot.ts haben sich geaendert -- Skript anpassen'
inline = """// ACHTUNG: Kopie von src/lib/pilot.ts fuer Deno -- nach jeder Aenderung dort
// neu erzeugen: npm run pilot:sync. Nur die zwei Imports sind hier inline.
function datumPlus(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}
type Kundenart = 'zahlend' | 'eigen' | 'referenz' | 'passiv'
function artVon(wert: string | null | undefined): Kundenart {
  return wert === 'referenz' || wert === 'passiv' || wert === 'eigen' ? wert : 'zahlend'
}
const RANG: Record<Kundenart, number> = { zahlend: 0, eigen: 1, referenz: 2, passiv: 3 }
function rangVon(wert: string | null | undefined): number { return RANG[artVon(wert)] }
"""
ziel = pathlib.Path('supabase/functions/pilot-push/pilot.ts')
ziel.write_text(quelle.replace(imports, inline))
print('ok:', ziel)
