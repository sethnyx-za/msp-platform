import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Package } from "lucide-react"
import CatalogManager from "@/components/admin/catalog/CatalogManager"

export const metadata = { title: "Product Catalog" }

export default async function CatalogPage() {
  const session = await auth()
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Product Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Manage products and services used in quotes and onboarding workflows.
          </p>
        </div>
      </div>

      <CatalogManager />
    </div>
  )
}
