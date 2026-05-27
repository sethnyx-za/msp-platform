import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { getOrganizationById, getChildOrganizations } from "@/lib/services/organizations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Building2, Users, Plug, ArrowLeft, Activity, Server, Wifi } from "lucide-react"
import Link from "next/link"
import AteraConfig from "@/components/admin/integrations/AteraConfig"
import UnifiConfig from "@/components/admin/integrations/UnifiConfig"
import UispConfig from "@/components/admin/integrations/UispConfig"
import SyncStatus from "@/components/admin/integrations/SyncStatus"
import UsersTable from "@/components/admin/users/UsersTable"
import AssetsTable from "@/components/admin/assets/AssetsTable"
import NetworkStatusDashboard from "@/components/admin/status/NetworkStatusDashboard"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const org = await getOrganizationById(id)
  return { title: org?.name ?? "Client" }
}

export default async function ClientDetailPage({ params }: Props) {
  const [session, { id }] = await Promise.all([auth(), params])

  if (!session?.user?.isMspStaff) redirect("/dashboard")

  const [org, children] = await Promise.all([
    getOrganizationById(id),
    getChildOrganizations(id),
  ])

  if (!org || org.isMspOrg) notFound()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/clients" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Clients
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{org.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{org.name}</h1>
              {org.isMaster && <Badge variant="secondary">Master</Badge>}
              {org.parentId && <Badge variant="outline">Branch</Badge>}
              <Badge variant={org.isActive ? "success" : "secondary"}>
                {org.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5 font-mono">{org.slug}</p>
          </div>
        </div>

        <div className="text-right text-sm text-muted-foreground space-y-1">
          {org.phone && <p>{org.phone}</p>}
          {org.website && (
            <a href={org.website} target="_blank" rel="noreferrer" className="hover:underline text-primary">
              {org.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {(org.slaHoursResponse || org.slaHoursResolution) && (
            <p>SLA: {org.slaHoursResponse ?? "—"}h resp / {org.slaHoursResolution ?? "—"}h res</p>
          )}
        </div>
      </div>

      {/* Child orgs */}
      {children.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">
            <Building2 className="inline h-3.5 w-3.5 mr-1" />
            {children.length} branch{children.length !== 1 ? "es" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <Link key={child.id} href={`/admin/clients/${child.id}`}>
                <Badge variant="outline" className="hover:bg-muted cursor-pointer">
                  {child.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">
            <Plug className="h-4 w-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="sync">
            <Activity className="h-4 w-4 mr-2" />
            Sync
          </TabsTrigger>
          <TabsTrigger value="assets">
            <Server className="h-4 w-4 mr-2" />
            Assets
          </TabsTrigger>
          <TabsTrigger value="network">
            <Wifi className="h-4 w-4 mr-2" />
            Network
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          <AteraConfig organizationId={org.id} organizationName={org.name} />
          <UnifiConfig organizationId={org.id} organizationName={org.name} />
          <UispConfig organizationId={org.id} organizationName={org.name} />
        </TabsContent>

        <TabsContent value="sync" className="mt-6">
          <div className="max-w-2xl space-y-2">
            <div className="mb-4">
              <h3 className="font-medium">Sync Health</h3>
              <p className="text-sm text-muted-foreground">
                Monitor and control background sync jobs for each integration.
              </p>
            </div>
            <SyncStatus organizationId={org.id} />
          </div>
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <AssetsTable organizationId={org.id} showOrgColumn={false} />
        </TabsContent>

        <TabsContent value="network" className="mt-6">
          <NetworkStatusDashboard initialOrgId={org.id} />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UsersTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
