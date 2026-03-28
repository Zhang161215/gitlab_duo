import type { ReactNode } from "react"
import Sidebar from "./Sidebar"

export default function Layout({ page, onNavigate, onLogout, children }: {
  page: string
  onNavigate: (p: string) => void
  onLogout: () => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-surface-0 text-text-primary">
      <Sidebar current={page} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="ml-56 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  )
}
