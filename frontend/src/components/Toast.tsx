import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { CheckCircle2, AlertTriangle, X } from "lucide-react"

type ToastType = "success" | "error"
type Toast = { id: number; message: string; type: ToastType }
type ToastCtx = { toast: (message: string, type?: ToastType) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

let _id = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<number[]>([])

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++_id
    setToasts((t) => [...t, { id, message, type }])
    const timer = window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
      timersRef.current = timersRef.current.filter((v) => v !== timer)
    }, 3500)
    timersRef.current.push(timer)
  }, [])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t))
      timersRef.current = []
    }
  }, [])

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))

  return (
    <Ctx value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-md ${
              t.type === "success"
                ? "border-success/20 bg-success/10 text-success"
                : "border-danger/20 bg-danger/10 text-danger"
            }`}
          >
            {t.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-2 cursor-pointer opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx>
  )
}
