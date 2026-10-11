import { rufeFunktion } from './funktion'

export interface MailAttachment { filename: string; mime: string; base64: string }

export interface SendMailInput {
  to: string
  subject: string
  html: string
  attachments?: MailAttachment[]
}

// Mail über Zoho verschicken (Edge Function mail-send)
export async function sendMail(input: SendMailInput): Promise<void> {
  await rufeFunktion('mail-send', { ...input })
}

// Zoho-Verbindung prüfen (Token + Konto), ohne etwas zu verschicken
export async function testMailConnection(): Promise<{ from?: string; accountId?: string }> {
  const data = await rufeFunktion<{ from?: string; accountId?: string }>('mail-send', { test: true })
  return { from: data?.from, accountId: data?.accountId }
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
  const data = await rufeFunktion<{ imported?: number; checked?: number }>('mail-sync')
  return { imported: data?.imported ?? 0, checked: data?.checked ?? 0 }
}
