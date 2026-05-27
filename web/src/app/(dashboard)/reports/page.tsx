import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { FileBarChart2 } from "lucide-react"
import ClientReportsList from "@/components/reports/ClientReportsList"

export const metadata = { title: "Reports" }

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // MSP staff don't use the client portal reports page
  if (session.user.isMspStaff) redirect("/admin/reports")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileBarChart2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Download your monthly managed services reports.
          </p>
        </div>
      </div>

      <ClientReportsList />
    </div>
  )
}
