import { initials } from '../lib/storage'

interface Props {
  name: string
  logoUrl: string | null
  className?: string
}

// Zeigt das Logo oder – falls keins hinterlegt – die Initialen im Marken-Verlauf.
export default function LogoFrame({ name, logoUrl, className }: Props) {
  return (
    <div className={`logo-frame ${className ?? ''}`}>
      {logoUrl ? (
        <img src={logoUrl} alt={`${name} Logo`} />
      ) : (
        <div className="logo-fallback">{initials(name)}</div>
      )}
    </div>
  )
}
