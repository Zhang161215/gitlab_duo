import { useState } from "react"
import { X, Loader2 } from "lucide-react"

export default function AddKeyDialog({ open, onClose, onAdd }: {
  open: boolean
  onClose: () => void
  onAdd: (name: string, pat: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [pat, setPat] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async () => {
    if (!name.trim() || !pat.trim()) return
    setSubmitting(true)
    try {
      await onAdd(name.trim(), pat.trim())
      setName(""); setPat(""); onClose()
    } catch { /* parent handles */ } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose}>
      <div className="animate-fade-in w-full max-w-md rounded-2xl border border-border bg-surface-2 p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">添加密钥</h2>
          <button onClick={onClose} disabled={submitting} className="cursor-pointer rounded-lg p-1 text-text-muted hover:bg-surface-4 hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">名称</label>
            <input
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-dim focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="例如：个人 PAT" autoFocus disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">GitLab PAT</label>
            <input
              className="w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 font-mono text-sm text-text-primary outline-none transition-colors placeholder:text-text-dim focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              value={pat} onChange={(e) => setPat(e.target.value)}
              placeholder="glpat-xxxxxxxxxxxx" disabled={submitting}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="cursor-pointer rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim() || !pat.trim()}
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> 添加中...</> : "添加"}
          </button>
        </div>
      </div>
    </div>
  )
}
