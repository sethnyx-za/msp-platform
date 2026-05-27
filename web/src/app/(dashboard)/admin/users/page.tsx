import { redirect } from "next/navigation"
import { auth } from "@/auth"
import UsersTable from "@/components/admin/users/UsersTable"

export const metadata = { title: "Users" }

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">
          Manage user accounts, roles, and authentication settings
        </p>
      </div>
      <UsersTable />
    </div>
  )
}
