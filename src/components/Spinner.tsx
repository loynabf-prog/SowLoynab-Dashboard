export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-wrap">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  )
}
