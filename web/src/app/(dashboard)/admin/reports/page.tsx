import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { FileBarChart2 } from "lucide-react"
import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import ReportsDashboard from "@/components/admin/reports/ReportsDashboard"

export const metadata = { title: "Reports & Analytics" }

export default async function AdminReportsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  // Load all active client orgs for selectors
  const clientOrgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.isActive, true))
    .orderBy(organizations.name)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileBarChart2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide insights, generated PDF reports, and scheduled delivery.
          </p>
        </div>
      </div>

      <ReportsDashboard orgs={clientOrgs} />
    </div>
  )
}
