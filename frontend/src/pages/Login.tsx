import { useState } from "react"
import { useToast } from "../components/Toast"
import { login, getErrorMessage } from "../api"
import { Zap, Loader2 } from "lucide-react"

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    try {
      await login(password.trim())
      onLogin()
    } catch (err) {
      toast(getErrorMessage(err), "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0">
      <form onSubmit={handleSubmit} className="w-full max-w-sm animate-fade-in rounded-2xl border border-border bg-surface-1 p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light shadow-md">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Duo Manager</h1>
          <p className="mt-1 text-sm text-text-muted">请输入管理密码登录</p>
        </div>
        <input
          type="password"
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text-primary placeholder-text-dim outline-none transition-colors focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密码"
          autoFocus
          disabled={loading}
        />
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-all hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
          disabled={loading || !password.trim()}
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> 登录中...</> : "登录"}
        </button>
      </form>
    </div>
  )
}
