import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ArrowLeft } from "lucide-react"
import SubmissionDetail from "@/components/admin/onboarding/SubmissionDetail"

interface Props { params: Promise<{ id: string }> }

export const metadata = { title: "Onboarding Submission" }

export default async function AdminSubmissionPage({ params }: Props) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/onboarding" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Onboarding Queue
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Submission</span>
      </div>

      <SubmissionDetail submissionId={id} />
    </div>
  )
}
