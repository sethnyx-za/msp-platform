import { auth } from "@/auth"
import { Metadata } from "next"
import {
  Building2, Users, Server, AlertTriangle,
  ClipboardList, FileBarChart2, ArrowRight,
} from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const session = await auth()
  const user = session!.user

  const isMsp = user.isMspStaff

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isMsp ? "MSP Overview" : user.organizationName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isMsp
            ? "Manage your clients, integrations, and platform settings."
            : `Welcome back, ${user.name.split(" ")[0]}`}
        </p>
      </div>

      {/* Quick-stat cards — placeholder data until integrations are built */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label="Monitored Devices"
          value="—"
          sub="Sync not configured"
          color="blue"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Active Alerts"
          value="—"
          sub="Sync not configured"
          color="amber"
        />
        <StatCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="Open Tickets"
          value="—"
          sub="Sync not configured"
          color="purple"
        />
        <StatCard
          icon={<FileBarChart2 className="w-5 h-5" />}
          label="Reports This Month"
          value="0"
          sub="No reports generated"
          color="green"
        />
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isMsp ? (
          <>
            <QuickActionCard
              icon={<Building2 className="w-5 h-5" />}
              title="Clients"
              description="Manage client organisations, users, and assignments"
              href="/admin/clients"
            />
            <QuickActionCard
              icon={<Users className="w-5 h-5" />}
              title="Users"
              description="Create and manage MSP staff and client user accounts"
              href="/admin/users"
            />
            <QuickActionCard
              icon={<Server className="w-5 h-5" />}
              title="Integrations"
              description="Configure Atera, Unifi, UISP, and email connections"
              href="/admin/integrations"
            />
          </>
        ) : (
          <>
            <QuickActionCard
              icon={<ClipboardList className="w-5 h-5" />}
              title="New Onboarding"
              description="Submit a new starter onboarding request"
              href="/onboarding/new"
            />
            <QuickActionCard
              icon={<Server className="w-5 h-5" />}
              title="Asset Registry"
              description="View and manage your IT asset inventory"
              href="/assets"
            />
            <QuickActionCard
              icon={<FileBarChart2 className="w-5 h-5" />}
              title="Reports"
              description="View your monthly IT infrastructure reports"
              href="/reports"
            />
          </>
        )}
      </div>

      {/* Phase notice */}
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Phase 1 complete.</strong>{" "}
        Authentication, RBAC, and the platform shell are live. Integrations, asset
        registry, onboarding, and reporting will be built in subsequent phases.
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: "blue" | "amber" | "purple" | "green"
}) {
  const colours = {
    blue:   "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400",
    amber:  "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400",
    green:  "bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400",
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={`p-1.5 rounded-lg ${colours[color]}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

function QuickActionCard({
  icon, title, description, href,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-4 hover:border-primary/50 hover:bg-accent/50 transition-all space-y-3"
    >
      <div className="flex items-start justify-between">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
      <div>
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </Link>
  )
}
