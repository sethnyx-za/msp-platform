import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ClipboardList, Plus } from "lucide-react"
import { db } from "@/lib/db"
import { onboardingSubmissions } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import OnboardingWizard from "@/components/onboarding/OnboardingWizard"
import SubmissionCard from "@/components/onboarding/SubmissionCard"

export const metadata = { title: "Onboarding" }

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.isMspStaff) redirect("/admin/onboarding")

  const orgId = session.user.organizationId

  // Fetch recent submissions for history tab
  const recentSubmissions = await db
    .select()
    .from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.organizationId, orgId))
    .orderBy(desc(onboardingSubmissions.createdAt))
    .limit(20)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">New Starter Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Submit equipment and access requests for new employees.
          </p>
        </div>
      </div>

      <Tabs defaultValue={recentSubmissions.length > 0 ? "history" : "new"}>
        <TabsList>
          <TabsTrigger value="new">
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </TabsTrigger>
          <TabsTrigger value="history">
            <ClipboardList className="h-4 w-4 mr-2" />
            History {recentSubmissions.length > 0 && `(${recentSubmissions.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">
          <OnboardingWizard />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {recentSubmissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No onboarding requests yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSubmissions.map((sub) => (
                <SubmissionCard key={sub.id} submission={{
                  id: sub.id,
                  starterFirstName: sub.starterFirstName,
                  starterLastName: sub.starterLastName,
                  starterJobTitle: sub.starterJobTitle,
                  startDate: sub.startDate,
                  status: sub.status,
                  totalQuotedPrice: sub.totalQuotedPrice,
                  currency: sub.currency,
                  ateraTicketId: sub.ateraTicketId,
                  submittedAt: sub.submittedAt?.toISOString() ?? null,
                  createdAt: sub.createdAt.toISOString(),
                }} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
