import { LayoutDashboard, Key, ScrollText, Settings, LogOut, Zap } from "lucide-react"

interface SidebarProps {
  current: string
  onNavigate: (page: string) => void
  onLogout: () => void
}

const NAV = [
  { id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { id: "keys", label: "密钥管理", icon: Key },
  { id: "logs", label: "请求日志", icon: ScrollText },
  { id: "settings", label: "设置", icon: Settings },
] as const

export default function Sidebar({ current, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-border bg-surface-1">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-light shadow-sm">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-text-primary">Duo Manager</div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim">GitLab Proxy</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
              current === id
                ? "bg-brand/10 font-medium text-brand-light"
                : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-border px-2 py-3">
        <button
          onClick={onLogout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <LogOut className="h-[18px] w-[18px]" />
          退出登录
        </button>
      </div>
    </aside>
  )
}
