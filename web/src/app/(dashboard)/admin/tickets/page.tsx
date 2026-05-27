import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import AdminTicketQueue from "@/components/admin/tickets/AdminTicketQueue"

export const metadata = { title: "Support Tickets — Admin" }

export default async function AdminTicketsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  // Load all client orgs for filter dropdown
  const clientOrgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.isMspOrg, false))
    .orderBy(organizations.name)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground mt-1">
          All client tickets — synced with Atera
        </p>
      </div>
      <AdminTicketQueue orgs={clientOrgs} />
    </div>
  )
}
