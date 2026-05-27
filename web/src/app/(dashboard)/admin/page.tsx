import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Metadata } from "next"
import { Building2, Users, Server, ShieldCheck, ArrowRight, Plug, Settings } from "lucide-react"
import Link from "next/link"
import { db } from "@/lib/db"
import { organizations, users, integrationConfigs } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"

export const metadata: Metadata = { title: "Admin Overview" }

async function getOverviewStats() {
  try {
    const [clientCount, userCount, integrationCount, mfaCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(organizations)
        .where(and(eq(organizations.isMspOrg, false), eq(organizations.isActive, true))),
      db.select({ count: sql<number>`count(*)::int` }).from(users)
        .where(eq(users.isActive, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(integrationConfigs)
        .where(eq(integrationConfigs.syncEnabled, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(users)
        .where(and(eq(users.totpEnabled, true), eq(users.isActive, true))),
    ])
    return {
      clients: clientCount[0]?.count ?? 0,
      users: userCount[0]?.count ?? 0,
      integrations: integrationCount[0]?.count ?? 0,
      mfaEnabled: mfaCount[0]?.count ?? 0,
    }
  } catch {
    return { clients: 0, users: 0, integrations: 0, mfaEnabled: 0 }
  }
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user.isMspStaff) redirect("/dashboard")

  const stats = await getOverviewStats()

  const statCards = [
    { label: "Active Clients",    value: stats.clients,     icon: Building2,    href: "/admin/clients",      color: "text-blue-600" },
    { label: "Active Users",      value: stats.users,       icon: Users,        href: "/admin/users",        color: "text-violet-600" },
    { label: "Integrations",      value: stats.integrations, icon: Plug,        href: "/admin/clients",      color: "text-green-600" },
    { label: "Users with MFA",    value: stats.mfaEnabled,  icon: ShieldCheck,  href: "/admin/users",        color: "text-amber-600" },
  ]

  const quickLinks = [
    { label: "Add a Client",       desc: "Create a new client organisation",       href: "/admin/clients",       icon: Building2 },
    { label: "Add a User",         desc: "Create a user account and assign a role", href: "/admin/users",         icon: Users },
    { label: "Configure Integration", desc: "Link Atera/Unifi/UISP to a client",    href: "/admin/clients",       icon: Server },
    { label: "Platform Settings",  desc: "Branding, email templates, backup",       href: "/admin/settings",      icon: Settings },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MSP Admin Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back{session.user.name ? `, ${session.user.name}` : ""}. Here's your platform at a glance.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((item) => (
          <Link key={item.label} href={item.href}
            className="rounded-xl border bg-card p-5 hover:border-primary/40 transition group space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <div className={`p-2 rounded-lg bg-muted ${item.color}`}>
                <item.icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold">{item.value}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition">
              View <ArrowRight className="w-3 h-3" />
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickLinks.map((item) => (
            <Link key={item.label} href={item.href}
              className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 transition group">
              <div className="p-2.5 rounded-lg bg-muted shrink-0">
                <item.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
              </div>
              <ArrowRight className="ml-auto w-4 h-4 text-muted-foreground group-hover:text-primary transition shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Phase status */}
      <div className="rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium mb-1">Phase 2 — MSP Admin Portal</p>
        <p className="text-muted-foreground">
          Client management, user administration, and integration configuration are now live.
          Phase 3 (Sync Engine & Background Jobs) builds on this foundation.
        </p>
      </div>
    </div>
  )
}
