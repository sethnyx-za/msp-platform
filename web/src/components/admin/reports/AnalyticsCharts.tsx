"use client"

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

// ─── Colour palette ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  computer: "#3B82F6",
  screen: "#8B5CF6",
  printer: "#EC4899",
  server: "#F97316",
  network_equipment: "#10B981",
  other: "#6B7280",
}

const STATUS_COLORS: Record<string, string> = {
  active: "#10B981",
  inactive: "#F59E0B",
  in_maintenance: "#3B82F6",
  retired: "#6B7280",
  disposed: "#EF4444",
  missing: "#DC2626",
}

const OB_STATUS_COLORS: Record<string, string> = {
  draft: "#6B7280",
  pending_approval: "#F59E0B",
  approved: "#3B82F6",
  rejected: "#EF4444",
  completed: "#10B981",
  cancelled: "#9CA3AF",
}

const CHART_PALETTE = ["#3B82F6", "#8B5CF6", "#EC4899", "#F97316", "#10B981", "#F59E0B", "#6366F1", "#14B8A6"]

// ─── Label helpers ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  computer: "Computer", screen: "Screen", printer: "Printer",
  server: "Server", network_equipment: "Network Equip.", other: "Other",
}
const STATUS_LABELS: Record<string, string> = {
  active: "Active", inactive: "Inactive", in_maintenance: "Maintenance",
  retired: "Retired", disposed: "Disposed", missing: "Missing",
}
const OB_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_approval: "Pending", approved: "Approved",
  rejected: "Rejected", completed: "Completed", cancelled: "Cancelled",
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function TooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      {label && <p className="font-medium text-foreground mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Asset Distribution (Pie) ─────────────────────────────────────────────────

interface CategoryData { category: string; count: number }

export function AssetDistributionChart({ data }: { data: CategoryData[] }) {
  const chartData = data.map((d) => ({
    name: CATEGORY_LABELS[d.category] ?? d.category,
    value: d.count,
    fill: CATEGORY_COLORS[d.category] ?? "#6B7280",
  }))

  if (!chartData.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<TooltipContent />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Asset Status (Bar) ───────────────────────────────────────────────────────

interface StatusData { status: string; count: number }

export function AssetStatusChart({ data }: { data: StatusData[] }) {
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    count: d.count,
    fill: STATUS_COLORS[d.status] ?? "#6B7280",
  }))

  if (!chartData.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
        <Tooltip content={<TooltipContent />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Onboarding Trend (Area) ──────────────────────────────────────────────────

interface TrendData { month: string; total: number; completed: number }

export function OnboardingTrendChart({ data }: { data: TrendData[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    Total: d.total,
    Completed: d.completed,
  }))

  if (!chartData.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <defs>
          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
        <Tooltip content={<TooltipContent />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
        <Area type="monotone" dataKey="Total" stroke="#3B82F6" strokeWidth={2} fill="url(#colorTotal)" />
        <Area type="monotone" dataKey="Completed" stroke="#10B981" strokeWidth={2} fill="url(#colorCompleted)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Onboarding Status (horizontal bar) ──────────────────────────────────────

export function OnboardingStatusChart({ data }: { data: StatusData[] }) {
  const chartData = data.map((d) => ({
    name: OB_STATUS_LABELS[d.status] ?? d.status,
    count: d.count,
    fill: OB_STATUS_COLORS[d.status] ?? "#6B7280",
  }))

  if (!chartData.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} className="text-muted-foreground" />
        <Tooltip content={<TooltipContent />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Top Organizations (horizontal bar) ──────────────────────────────────────

interface TopOrgData { id: string; name: string; assetCount: number }

export function TopOrganizationsChart({ data }: { data: TopOrgData[] }) {
  const chartData = data.slice(0, 8).map((d, i) => ({
    name: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
    Assets: d.assetCount,
    fill: CHART_PALETTE[i % CHART_PALETTE.length],
  }))

  if (!chartData.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 36)}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} className="text-muted-foreground" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} className="text-muted-foreground" />
        <Tooltip content={<TooltipContent />} />
        <Bar dataKey="Assets" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
      No data available
    </div>
  )
}
