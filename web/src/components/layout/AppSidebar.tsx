"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { SessionUser } from "@/types"
import {
  LayoutDashboard, Server, ClipboardList, FileBarChart2,
  Ticket, FolderOpen, Package, Settings, Users,
  Building2, Wrench, ShieldCheck, ChevronRight,
  Activity,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  mspOnly?: boolean
  clientOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  // ─── MSP Admin ──────────────────────────────────────────────────────────────
  { label: "Overview",      href: "/admin",              icon: <LayoutDashboard className="w-4 h-4" />, mspOnly: true },
  { label: "Clients",       href: "/admin/clients",       icon: <Building2 className="w-4 h-4" />,       mspOnly: true },
  { label: "Users",         href: "/admin/users",         icon: <Users className="w-4 h-4" />,           mspOnly: true },
  { label: "Integrations",  href: "/admin/integrations",  icon: <Wrench className="w-4 h-4" />,          mspOnly: true },
  { label: "Onboarding",    href: "/admin/onboarding",    icon: <ClipboardList className="w-4 h-4" />,   mspOnly: true },
  { label: "Catalog",       href: "/admin/catalog",       icon: <Package className="w-4 h-4" />,         mspOnly: true },
  { label: "Assets",        href: "/admin/assets",        icon: <Server className="w-4 h-4" />,          mspOnly: true },
  { label: "Reports",       href: "/admin/reports",       icon: <FileBarChart2 className="w-4 h-4" />,    mspOnly: true },
  { label: "Tickets",       href: "/admin/tickets",       icon: <Ticket className="w-4 h-4" />,          mspOnly: true },
  { label: "Net Status",    href: "/admin/status",        icon: <Activity className="w-4 h-4" />,        mspOnly: true },
  { label: "Settings",      href: "/admin/settings",      icon: <Settings className="w-4 h-4" />,        mspOnly: true },

  // ─── Client Portal ──────────────────────────────────────────────────────────
  { label: "Dashboard",     href: "/dashboard",           icon: <LayoutDashboard className="w-4 h-4" />, clientOnly: true },
  { label: "Status",        href: "/status",              icon: <Activity className="w-4 h-4" />,        clientOnly: true },
  { label: "Onboarding",    href: "/onboarding",          icon: <ClipboardList className="w-4 h-4" />,   clientOnly: true },
  { label: "Assets",        href: "/assets",              icon: <Server className="w-4 h-4" />,          clientOnly: true },
  { label: "Reports",       href: "/reports",             icon: <FileBarChart2 className="w-4 h-4" />,   clientOnly: true },
  { label: "Tickets",       href: "/tickets",             icon: <Ticket className="w-4 h-4" />,          clientOnly: true },
  { label: "Documents",     href: "/documents",           icon: <FolderOpen className="w-4 h-4" />,      clientOnly: true },
]

interface AppSidebarProps {
  user: SessionUser
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const isMsp = user.isMspStaff

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.mspOnly && !isMsp) return false
    if (item.clientOnly && isMsp) return false
    return true
  })

  return (
    <aside className="flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-full overflow-hidden shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground text-sm">MSP Platform</span>
        </div>
      </div>

      {/* Client org header (client portal only) */}
      {!isMsp && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            {user.organizationLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.organizationLogoUrl} alt={user.organizationName} className="w-6 h-6 rounded object-contain" />
            ) : (
              <div className="w-6 h-6 bg-sidebar-accent rounded flex items-center justify-center text-xs font-bold text-sidebar-accent-foreground">
                {user.organizationName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.organizationName}</p>
              <p className="text-[10px] text-sidebar-foreground/60 capitalize">
                {user.role.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-thin">
        {visibleItems.map((item) => {
          const isActive = item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/30">v0.7.0 — Phase 7</p>
      </div>
    </aside>
  )
}
