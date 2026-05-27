import { redirect } from "next/navigation"
import { auth } from "@/auth"

// Root "/" — redirect to the right place based on role
export default async function RootPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  redirect(session.user.isMspStaff ? "/admin" : "/dashboard")
}
