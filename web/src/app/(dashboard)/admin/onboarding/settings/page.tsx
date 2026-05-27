import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ArrowLeft, Settings } from "lucide-react"
import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import OnboardingSettingsClient from "@/components/admin/onboarding/OnboardingSettingsClient"

export const metadata = { title: "Onboarding Settings" }

export default async function OnboardingSettingsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  // Load all active client orgs for the selector
  const clientOrgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.isActive, true))
    .orderBy(organizations.name)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/onboarding" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Onboarding Queue
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Settings</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Onboarding Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure locations, shared resources, and Atera ticket routing per client.
          </p>
        </div>
      </div>

      <OnboardingSettingsClient orgs={clientOrgs} />
    </div>
  )
}
