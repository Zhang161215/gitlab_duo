import { useEffect, useState } from "react"
import { useToast } from "../components/Toast"
import {
  fetchSettings, getErrorMessage, updateSettings,
  fetchApiKeys, addApiKey, deleteApiKey, updateApiKey,
  type SettingsInfo, type ApiKeyInfo,
} from "../api"
import { Copy, Trash2, Plus, Loader2 } from "lucide-react"

export default function Settings() {
  const [settings, setSettings] = useState<SettingsInfo | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const [s, ak] = await Promise.all([fetchSettings(ctrl.signal), fetchApiKeys()])
        setSettings(s); setApiKeys(ak)
      } catch (e) { if (!ctrl.signal.aborted) toast(getErrorMessage(e), "error") }
      finally { if (!ctrl.signal.aborted) setLoading(false) }
    })()
    return () => ctrl.abort()
  }, [toast])

  if (loading) return <div className="py-12 text-center text-sm text-text-muted"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
  if (!settings) return <div className="text-sm text-danger">加载失败</div>

  const save = async (fields: Record<string, unknown>) => {
    try { setSettings(await updateSettings(fields)); toast("已保存") }
    catch (e) { toast(getErrorMessage(e), "error") }
  }

  const handleAddApiKey = async () => {
    if (!newKeyName.trim()) return
    try {
      const entry = await addApiKey(newKeyName.trim())
      setApiKeys((p) => [...p, entry]); setNewKeyName("")
      toast("已创建 API Key")
    } catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleDeleteApiKey = async (id: string) => {
    if (!confirm("确定删除？")) return
    try { await deleteApiKey(id); setApiKeys((p) => p.filter((k) => k.id !== id)); toast("已删除") }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleToggleAutoContinue = async (ak: ApiKeyInfo) => {
    try {
      const updated = await updateApiKey(ak.id, { auto_continue: !ak.auto_continue })
      setApiKeys((p) => p.map((k) => (k.id === ak.id ? updated : k)))
      toast(ak.auto_continue ? "已关闭续传" : "已开启续传")
    } catch (e) { toast(getErrorMessage(e), "error") }
  }
  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      toast("已复制")
    } catch (e) { toast(getErrorMessage(e), "error") }
  }

  const MODES = [
    ["round_robin", "轮询均衡"],
    ["weighted_round_robin", "加权轮询"],
    ["ordered_fallback", "顺序降级"],
  ] as const

  const inputCls = "w-full rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-dim focus:border-brand/50 focus:ring-2 focus:ring-brand/20"

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-text-primary">设置</h1>

      {/* Rotation Mode */}
      <section className="card">
        <h2 className="card-title">轮询模式</h2>
        <div className="flex gap-2 flex-wrap">
          {MODES.map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => save({ rotation_mode: mode })}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                settings.rotation_mode === mode
                  ? "bg-brand text-white shadow-sm"
                  : "border border-border bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary"
              }`}
            >{label}</button>
          ))}
        </div>
      </section>

      {/* Proxy Strategy */}
      <section className="card">
        <h2 className="card-title">代理策略</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="field-label">最大重试</label>
            <input type="number" min={0} max={10} className={inputCls}
              value={settings.max_retries}
              onChange={(e) => setSettings({ ...settings, max_retries: +e.target.value })}
              onBlur={() => save({ max_retries: settings.max_retries })} />
          </div>
          <div>
            <label className="field-label">黑名单阈值</label>
            <input type="number" min={0} max={100} className={inputCls}
              value={settings.blacklist_threshold}
              onChange={(e) => setSettings({ ...settings, blacklist_threshold: +e.target.value })}
              onBlur={() => save({ blacklist_threshold: settings.blacklist_threshold })} />
          </div>
          <div>
            <label className="field-label">验证间隔(分)</label>
            <input type="number" min={1} max={60} className={inputCls}
              value={settings.validation_interval}
              onChange={(e) => setSettings({ ...settings, validation_interval: +e.target.value })}
              onBlur={() => save({ validation_interval: settings.validation_interval })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="field-label">自动续传次数</label>
            <input type="number" min={0} max={10} className={inputCls}
              value={settings.max_continuations}
              onChange={(e) => setSettings({ ...settings, max_continuations: +e.target.value })}
              onBlur={() => save({ max_continuations: settings.max_continuations })} />
            <span className="text-xs text-text-dim mt-1 block">流式截断时自动续传，0=禁用</span>
          </div>
          <div>
            <label className="field-label">Token 上限</label>
            <input type="number" min={0} max={65536} className={inputCls}
              value={settings.max_tokens_cap}
              onChange={(e) => setSettings({ ...settings, max_tokens_cap: +e.target.value })}
              onBlur={() => save({ max_tokens_cap: settings.max_tokens_cap })} />
            <span className="text-xs text-text-dim mt-1 block">防 GitLab 93s 超时，0=不限</span>
          </div>
        </div>
        <div className="mt-4">
          <label className="field-label">测试模型</label>
          <select className={inputCls + " appearance-none"}
            value={settings.test_model}
            onChange={(e) => { setSettings({ ...settings, test_model: e.target.value }); void save({ test_model: e.target.value }) }}
          >
            <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            <option value="claude-opus-4-6">Claude Opus 4.6</option>
          </select>
        </div>
      </section>

      {/* API Keys */}
      <section className="card">
        <h2 className="card-title">代理 API Key</h2>
        <div className="space-y-2 mb-4">
          {apiKeys.map((ak) => (
            <div key={ak.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-3 p-3">
              <span className="text-sm font-medium text-text-primary w-24 shrink-0">{ak.name}</span>
              <code className="flex-1 text-xs font-mono text-text-muted break-all select-all">{ak.key}</code>
              <button onClick={() => void handleToggleAutoContinue(ak)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-all shrink-0 ${
                  ak.auto_continue
                    ? "bg-success/15 text-success border border-success/20"
                    : "bg-surface-4 text-text-dim border border-border"
                }`}
              >{ak.auto_continue ? "续传" : "直通"}</button>
              <button onClick={() => void copyKey(ak.key)} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-brand/10 hover:text-brand" title="复制">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => void handleDeleteApiKey(ak.id)} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger" title="删除">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {apiKeys.length === 0 && <p className="text-sm text-text-muted py-2">还没有 API Key</p>}
        </div>
        <div className="flex gap-2">
          <input className={inputCls + " flex-1"}
            value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="新 Key 名称" onKeyDown={(e) => e.key === "Enter" && handleAddApiKey()} />
          <button onClick={() => void handleAddApiKey()}
            className="btn-primary shrink-0" disabled={!newKeyName.trim()}>
            <Plus className="h-4 w-4" /> 创建
          </button>
        </div>
      </section>

      {/* Endpoints */}
      <section className="card">
        <h2 className="card-title">端点配置</h2>
        <div className="space-y-3">
          <div>
            <label className="field-label">GitLab URL</label>
            <input className={inputCls}
              value={settings.gitlab_url}
              onChange={(e) => setSettings({ ...settings, gitlab_url: e.target.value })}
              onBlur={() => save({ gitlab_url: settings.gitlab_url })} />
          </div>
          <div>
            <label className="field-label">Anthropic Proxy</label>
            <input className={inputCls}
              value={settings.anthropic_proxy}
              onChange={(e) => setSettings({ ...settings, anthropic_proxy: e.target.value })}
              onBlur={() => save({ anthropic_proxy: settings.anthropic_proxy })} />
          </div>
        </div>
      </section>
    </div>
  )
}
