// Typ-Hilfen für die Edge Functions.
// ---------------------------------------------------------------------------
// Die Funktionen laufen in Deno, der Rest des Projekts in Node. Unsere Tests
// prüfen aber dieselben Dateien, die auch deployed werden -- deshalb müssen
// sie hier durch die Typprüfung passen, ohne dass wir Deno installieren.

declare module 'npm:*'

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
  env: { get: (key: string) => string | undefined }
}
