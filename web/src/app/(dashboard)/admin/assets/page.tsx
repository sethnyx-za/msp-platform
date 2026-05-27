import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Server } from "lucide-react"
import AssetsTable from "@/components/admin/assets/AssetsTable"

export const metadata = { title: "Asset Registry" }

export default async function AssetsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Server className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Asset Registry</h1>
          <p className="text-sm text-muted-foreground">
            All client hardware and software assets — manually entered and Atera-synced.
          </p>
        </div>
      </div>

      <AssetsTable showOrgColumn />
    </div>
  )
}
