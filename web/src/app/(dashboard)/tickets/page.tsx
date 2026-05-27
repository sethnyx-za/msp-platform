import { redirect } from "next/navigation"
import { auth } from "@/auth"
import TicketList from "@/components/tickets/TicketList"

export const metadata = { title: "Support Tickets" }

export default async function TicketsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  // MSP staff go to the admin queue
  if (session.user.isMspStaff) redirect("/admin/tickets")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground mt-1">
          Submit and track support requests with your IT team
        </p>
      </div>
      <TicketList />
    </div>
  )
}
