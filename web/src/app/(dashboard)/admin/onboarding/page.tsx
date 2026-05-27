import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import OnboardingQueue from "@/components/admin/onboarding/OnboardingQueue"

export const metadata = { title: "Onboarding Queue" }

export default async function AdminOnboardingPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Onboarding Queue</h1>
            <p className="text-sm text-muted-foreground">
              Review and approve new starter requests from all clients.
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/onboarding/settings">Settings</Link>
        </Button>
      </div>

      <OnboardingQueue />
    </div>
  )
}
