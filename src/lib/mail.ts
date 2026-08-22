import { supabase } from './supabase'

export interface MailAttachment { filename: string; mime: string; base64: string }

export interface SendMailInput {
  to: string
  subject: string
  html: string
  attachments?: MailAttachment[]
}

// Mail über Zoho verschicken (Edge Function mail-send)
export async function sendMail(input: SendMailInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke('mail-send', { body: input })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
}

// Zoho-Verbindung prüfen (Token + Konto), ohne etwas zu verschicken
export async function testMailConnection(): Promise<{ from?: string; accountId?: string }> {
  const { data, error } = await supabase.functions.invoke('mail-send', { body: { test: true } })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return { from: (data as any)?.from, accountId: (data as any)?.accountId }
}

// Blob -> reines Base64 (ohne data:-Präfix) für den Anhang
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// Posteingang aus Zoho nachladen (Edge Function mail-sync)
export async function syncMail(): Promise<{ imported: number; checked: number }> {
  const { data, error } = await supabase.functions.invoke('mail-sync', { body: {} })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return { imported: (data as any)?.imported ?? 0, checked: (data as any)?.checked ?? 0 }
}
