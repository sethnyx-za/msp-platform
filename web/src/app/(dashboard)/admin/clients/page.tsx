import { redirect } from "next/navigation"
import { auth } from "@/auth"
import ClientsTable from "@/components/admin/clients/ClientsTable"

export const metadata = { title: "Clients" }

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-muted-foreground mt-1">
          Manage client organisations and their sub-branches
        </p>
      </div>
      <ClientsTable />
    </div>
  )
}
