/**
 * Shell — Mobile-responsive app layout.
 *
 * USAGE (in App.tsx or your router):
 *   <Shell sidebar={<MySidebarContent />}>
 *     <Page>...</Page>
 *   </Shell>
 *
 * The sidebar is hidden on mobile and toggled by a hamburger button.
 */
import React, { useState } from 'react'
import { Menu, X } from 'lucide-react'

interface ShellProps {
  /** Sidebar content */
  sidebar: React.ReactNode
  /** App name shown in mobile header */
  appName?: string
  children: React.ReactNode
}

export function Shell({ sidebar, appName = 'App', children }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="font-semibold text-sm">{appName}</span>
          <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        {sidebar}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-background sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu size={18} />
          </button>
          <span className="font-semibold text-sm">{appName}</span>
        </div>

        {children}
      </main>
    </div>
  )
}
