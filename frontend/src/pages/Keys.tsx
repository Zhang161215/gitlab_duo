import { useEffect, useState } from "react"
import KeyTable from "../components/KeyTable"
import AddKeyDialog from "../components/AddKeyDialog"
import { useToast } from "../components/Toast"
import {
  addKey, deleteKey, fetchKeys, getErrorMessage, testKey, updateKey, restoreKey,
  batchImportKeys, batchTestKeys, exportKeys, type KeyInfo,
} from "../api"
import { Plus, FlaskConical, Download, Upload, X, Loader2 } from "lucide-react"

export default function Keys() {
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchText, setBatchText] = useState("")
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchTesting, setBatchTesting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let disposed = false
    const controllers = new Set<AbortController>()
    const poll = async (showError: boolean) => {
      const ctrl = new AbortController()
      controllers.add(ctrl)
      try {
        const data = await fetchKeys(ctrl.signal)
        if (!disposed) setKeys(data)
      } catch (e) {
        if (showError && !ctrl.signal.aborted && !disposed) toast(getErrorMessage(e), "error")
      } finally { controllers.delete(ctrl) }
    }
    void poll(true)
    const timer = setInterval(() => void poll(false), 5000)
    return () => { disposed = true; clearInterval(timer); controllers.forEach((c) => c.abort()) }
  }, [toast])

  const reload = async () => { try { setKeys(await fetchKeys()) } catch { /* polling recovers */ } }

  const handleAdd = async (name: string, pat: string) => {
    try { await addKey(name, pat); toast("密钥已添加") } catch (e) { toast(getErrorMessage(e), "error"); throw e }
    await reload()
  }
  const handleToggle = async (id: string, enabled: boolean) => {
    try { await updateKey(id, { enabled }); toast(enabled ? "已启用" : "已禁用"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return
    try { await deleteKey(id); toast("已删除"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleTest = async (id: string) => {
    try {
      const res = await testKey(id)
      toast(res.message, res.valid ? "success" : "error")
      await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
  }
  const handleRestore = async (id: string) => {
    try { await restoreKey(id); toast("密钥已恢复"); await reload() }
    catch (e) { toast(getErrorMessage(e), "error") }
  }

  const handleBatchImport = async () => {
    if (!batchText.trim()) return
    setBatchImporting(true)
    try {
      const res = await batchImportKeys(batchText)
      const parts = [`已添加 ${res.added} 个`]
      if (res.skipped > 0) parts.push(`跳过 ${res.skipped} 个重复`)
      toast(parts.join("，"))
      setBatchText(""); setShowBatchImport(false); await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
    finally { setBatchImporting(false) }
  }

  const handleBatchTest = async () => {
    setBatchTesting(true)
    try {
      const results = await batchTestKeys()
      const ok = results.filter((r) => r.valid).length
      toast(`批量测试：${ok} 成功，${results.length - ok} 失败`)
      await reload()
    } catch (e) { toast(getErrorMessage(e), "error") }
    finally { setBatchTesting(false) }
  }

  const handleExport = async () => {
    try {
      const text = await exportKeys()
      if (!text.trim()) { toast("没有可导出的密钥", "error"); return }
      const blob = new Blob([text], { type: "text/plain" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = "gitlab-pats.txt"
      a.click()
      URL.revokeObjectURL(a.href)
      toast("已导出")
    } catch (e) { toast(getErrorMessage(e), "error") }
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">密钥管理</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => void handleBatchTest()} disabled={batchTesting || keys.length === 0}>
            {batchTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} 批量测试
          </button>
          <button className="btn-secondary" onClick={() => void handleExport()} disabled={keys.length === 0}>
            <Download className="h-4 w-4" /> 导出
          </button>
          <button className="btn-secondary" onClick={() => setShowBatchImport(true)}>
            <Upload className="h-4 w-4" /> 导入
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> 添加密钥
          </button>
        </div>
      </div>

      <KeyTable keys={keys} onToggle={handleToggle} onDelete={handleDelete} onTest={handleTest} onRestore={handleRestore} />
      <AddKeyDialog open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />

      {showBatchImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !batchImporting && setShowBatchImport(false)}>
          <div className="animate-fade-in w-full max-w-lg rounded-2xl border border-border bg-surface-2 p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">批量导入密钥</h2>
              <button onClick={() => setShowBatchImport(false)} disabled={batchImporting} className="cursor-pointer rounded-lg p-1 text-text-muted hover:bg-surface-4">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-text-muted">每行一个 PAT，支持「名称:PAT」格式。重复的 PAT 自动跳过。</p>
            <textarea
              className="h-40 w-full resize-none rounded-lg border border-border bg-surface-3 px-4 py-3 font-mono text-sm text-text-primary outline-none transition-colors placeholder:text-text-dim focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
              value={batchText} onChange={(e) => setBatchText(e.target.value)}
              placeholder={"Key 1:glpat-xxxx\nglpat-yyyy\nBackup:glpat-zzzz"}
              disabled={batchImporting} autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <button className="cursor-pointer rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary" onClick={() => setShowBatchImport(false)} disabled={batchImporting}>取消</button>
              <button
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light disabled:opacity-40"
                onClick={() => void handleBatchImport()} disabled={batchImporting || !batchText.trim()}
              >{batchImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> 导入中...</> : "导入"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
