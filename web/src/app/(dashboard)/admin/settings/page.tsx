import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Palette, Mail, HardDrive } from "lucide-react"
import BrandingSettings from "@/components/admin/settings/BrandingSettings"
import EmailConfigForm from "@/components/admin/settings/EmailConfigForm"

export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  const isSuperAdmin = session.user.role === "msp_super_admin"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Platform-wide configuration and branding</p>
      </div>

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding" disabled={!isSuperAdmin}>
            <Palette className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="email" disabled={!isSuperAdmin}>
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger value="backup" disabled={!isSuperAdmin}>
            <HardDrive className="h-4 w-4 mr-2" />
            Backup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-6">
          {isSuperAdmin ? (
            <BrandingSettings />
          ) : (
            <p className="text-muted-foreground text-sm">Only MSP Super Admins can manage branding settings.</p>
          )}
        </TabsContent>

        <TabsContent value="email" className="mt-6">
          {isSuperAdmin ? (
            <EmailConfigForm />
          ) : (
            <p className="text-muted-foreground text-sm">Only MSP Super Admins can manage email settings.</p>
          )}
        </TabsContent>

        <TabsContent value="backup" className="mt-6">
          <p className="text-muted-foreground text-sm">Backup destination management — coming soon.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
