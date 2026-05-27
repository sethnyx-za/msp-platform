import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Activity } from "lucide-react"
import NetworkStatusDashboard from "@/components/admin/status/NetworkStatusDashboard"

export const metadata = { title: "Network Status" }

export default async function StatusPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Network Status</h1>
          <p className="text-sm text-muted-foreground">
            Live Unifi and UISP status for each client, updated every sync cycle.
          </p>
        </div>
      </div>

      <NetworkStatusDashboard />
    </div>
  )
}
