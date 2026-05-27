"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, Server, ClipboardList, FileBarChart2, Calendar, AlertCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AssetDistributionChart, AssetStatusChart,
  OnboardingTrendChart, OnboardingStatusChart, TopOrganizationsChart,
} from "./AnalyticsCharts"
import ReportsList from "./ReportsList"
import SchedulesManager from "./SchedulesManager"

interface OrgOption { id: string; name: string }
interface Props {
  orgs: OrgOption[]
  initialOrgId?: string
}

interface AnalyticsData {
  summary: {
    totalAssets: number
    activeAssets: number
    pendingOnboarding: number
    completedOnboarding: number
    totalReports: number
    activeSchedules: number
  }
  assetsByCategory: { category: string; count: number }[]
  assetsByStatus: { status: string; count: number }[]
  onboardingByStatus: { status: string; count: number }[]
  onboardingTrend: { month: string; total: number; completed: number }[]
  topOrganizations?: { id: string; name: string; assetCount: number }[]
}

function StatCard({
  label, value, icon, color,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ReportsDashboard({ orgs, initialOrgId }: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState<string>(initialOrgId ?? "all")

  const analyticsQuery = useQuery<AnalyticsData>({
    queryKey: ["reports-analytics", selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedOrgId !== "all") params.set("organizationId", selectedOrgId)
      const res = await fetch(`/api/admin/reports/analytics?${params}`)
      if (!res.ok) throw new Error("Failed to load analytics")
      return res.json()
    },
    staleTime: 60_000,
  })

  const { data, isLoading, isError } = analyticsQuery
  const s = data?.summary

  return (
    <div className="space-y-6">
      {/* Org selector (only if viewing all) */}
      {!initialOrgId && (
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load analytics data.
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Assets"
          value={isLoading ? "…" : (s?.totalAssets ?? 0)}
          icon={<Server className="h-5 w-5 text-blue-600" />}
          color="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          label="Active Assets"
          value={isLoading ? "…" : (s?.activeAssets ?? 0)}
          icon={<Server className="h-5 w-5 text-emerald-600" />}
          color="bg-emerald-100 dark:bg-emerald-900/30"
        />
        <StatCard
          label="Pending Onboarding"
          value={isLoading ? "…" : (s?.pendingOnboarding ?? 0)}
          icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
          color="bg-amber-100 dark:bg-amber-900/30"
        />
        <StatCard
          label="Completed Onboarding"
          value={isLoading ? "…" : (s?.completedOnboarding ?? 0)}
          icon={<ClipboardList className="h-5 w-5 text-purple-600" />}
          color="bg-purple-100 dark:bg-purple-900/30"
        />
        <StatCard
          label="Reports Generated"
          value={isLoading ? "…" : (s?.totalReports ?? 0)}
          icon={<FileBarChart2 className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-100 dark:bg-indigo-900/30"
        />
        <StatCard
          label="Active Schedules"
          value={isLoading ? "…" : (s?.activeSchedules ?? 0)}
          icon={<Calendar className="h-5 w-5 text-rose-600" />}
          color="bg-rose-100 dark:bg-rose-900/30"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Asset Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-[220px] animate-pulse bg-muted rounded" />
              : <AssetDistributionChart data={data?.assetsByCategory ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Asset Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-[220px] animate-pulse bg-muted rounded" />
              : <AssetStatusChart data={data?.assetsByStatus ?? []} />}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Onboarding Trend (6 months)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-[220px] animate-pulse bg-muted rounded" />
              : <OnboardingTrendChart data={data?.onboardingTrend ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Onboarding by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-[220px] animate-pulse bg-muted rounded" />
              : <OnboardingStatusChart data={data?.onboardingByStatus ?? []} />}
          </CardContent>
        </Card>
      </div>

      {/* Top orgs (MSP all-clients view only) */}
      {selectedOrgId === "all" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Clients by Asset Count</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-[220px] animate-pulse bg-muted rounded" />
              : <TopOrganizationsChart data={data?.topOrganizations ?? []} />}
          </CardContent>
        </Card>
      )}

      {/* Reports & Schedules tabs */}
      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          <ReportsList
            organizationId={selectedOrgId !== "all" ? selectedOrgId : undefined}
            orgs={orgs}
          />
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <SchedulesManager
            organizationId={selectedOrgId !== "all" ? selectedOrgId : undefined}
            orgs={orgs}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
