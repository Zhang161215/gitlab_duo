import { useState } from "react"
import { useToast } from "../components/Toast"
import { login, getErrorMessage } from "../api"

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-kawaii-cream">
      <form onSubmit={handleSubmit} className="bg-white rounded-kawaii-lg shadow-kawaii-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3 animate-kawaii-float">{"\u2728"}</div>
          <h1 className="text-2xl font-bold kawaii-gradient-text">Duo Manager</h1>
          <p className="text-sm text-kawaii-text-md mt-1">{"\u8BF7\u8F93\u5165\u7BA1\u7406\u5BC6\u7801\u767B\u5F55"}</p>
        </div>
        <input
          type="password"
          className="w-full bg-kawaii-cream border-2 border-kawaii-pink-light rounded-kawaii-md px-4 py-3 text-sm focus:outline-none focus:border-kawaii-pink focus:shadow-[0_0_0_4px_rgba(255,182,217,0.2)] transition-all duration-300 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={"\u7BA1\u7406\u5BC6\u7801"}
          autoFocus
          disabled={loading}
        />
        <button
          type="submit"
          className="w-full kawaii-gradient-bg py-3 rounded-full text-sm font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-kawaii-md disabled:opacity-40"
          disabled={loading || !password.trim()}
        >
          {loading ? "\u767B\u5F55\u4E2D..." : "\u767B\u5F55"}
        </button>
      </form>
    </div>
  )
}
