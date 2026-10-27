import { supabase } from './supabase'

export interface Company {
  name?: string
  address?: string        // mehrzeilig
  taxId?: string          // Steuernummer
  vatId?: string          // USt-IdNr
  iban?: string
  bic?: string
  bank?: string
  email?: string
  phone?: string
  kleinunternehmer?: boolean
  defaultVat?: number     // z. B. 19
  footer?: string         // optionaler Fußtext
  // Fuer die Seite "Firmendaten" (/firma) -- alles, wonach mal jemand fragt
  rechtsform?: string     // z. B. GbR
  inhaber?: string        // Gesellschafter, mehrzeilig
  gruendung?: string      // z. B. 01.08.2026
  finanzamt?: string
  website?: string
  vatIdNotiz?: string     // z. B. "beantragt am 28.10."
  notizen?: string        // alles andere (Handelsregister, Kammer, …)
}

export async function getCompany(): Promise<Company> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  return ((data?.data as any)?.company ?? {}) as Company
}

export async function saveCompany(company: Company): Promise<void> {
  const { data } = await supabase.from('app_settings').select('data').eq('id', 1).single()
  const next = { ...((data?.data as any) ?? {}), company }
  await supabase.from('app_settings').update({ data: next, updated_at: new Date().toISOString() }).eq('id', 1)
}
