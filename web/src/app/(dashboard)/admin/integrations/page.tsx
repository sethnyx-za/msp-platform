import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import Link from "next/link"
import { Building2, ArrowRight, Plug } from "lucide-react"
import { testAteraConnection } from "@/lib/services/integrations/atera-client"

export const metadata = { title: "Integrations" }

export default async function IntegrationsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  // Atera is MSP-level — test connection here
  const ateraTest = await testAteraConnection().catch(() => ({ ok: false, error: "Failed to connect" }))

  // Get all active client orgs
  const clients = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(and(eq(organizations.isMspOrg, false), eq(organizations.isActive, true)))
    .orderBy(organizations.name)
    .limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Configure Atera (MSP-wide), and per-client Unifi Fabric + UISP connections
        </p>
      </div>

      {/* Atera — MSP-level */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
              <Plug className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold">Atera</p>
              <p className="text-sm text-muted-foreground">MSP-wide — set via <code className="text-xs bg-muted px-1 rounded">ATERA_API_KEY</code> environment variable</p>
            </div>
          </div>
          <div className={`text-sm font-medium flex items-center gap-1.5 ${ateraTest.ok ? "text-green-600" : "text-destructive"}`}>
            <span className={`h-2 w-2 rounded-full ${ateraTest.ok ? "bg-green-500" : "bg-red-500"}`} />
            {ateraTest.ok ? `Connected · ${"customerCount" in ateraTest ? ateraTest.customerCount : ""} customers` : `Error: ${ateraTest.error}`}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          To link a client to an Atera customer, open the client's detail page and configure the Atera mapping there.
        </p>
      </div>

      {/* Per-client integrations */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Client Integrations (Unifi Fabric + UISP)
        </h2>
        <div className="space-y-2">
          {clients.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              No active clients yet. <Link href="/admin/clients" className="text-primary hover:underline">Add a client</Link> first.
            </div>
          ) : (
            clients.map((client) => (
              <Link
                key={client.id}
                href={`/admin/clients/${client.id}?tab=integrations`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 transition group"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                  {client.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{client.slug}</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition">
                  Configure
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))
          )}
        </div>
        {clients.length === 50 && (
          <p className="text-xs text-muted-foreground mt-2">Showing first 50 clients. <Link href="/admin/clients" className="text-primary hover:underline">View all →</Link></p>
        )}
      </div>
    </div>
  )
}
