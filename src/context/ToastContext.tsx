import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastValue {
  toast: (message: string, action?: Toast['action']) => void
}

const ToastContext = createContext<ToastValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)

  const toast = useCallback((message: string, action?: Toast['action']) => {
    const id = next.current++
    setToasts((prev) => [...prev, { id, message, action }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), action ? 6000 : 2600)
  }, [])

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast muss innerhalb von <ToastProvider> genutzt werden')
  return ctx
}
