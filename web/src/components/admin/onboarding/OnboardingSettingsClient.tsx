"use client"

import { useState } from "react"
import { Building2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import OnboardingSettings from "./OnboardingSettings"

interface OrgOption { id: string; name: string }

interface Props { orgs: OrgOption[] }

export default function OnboardingSettingsClient({ orgs }: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState(orgs[0]?.id ?? "")
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId)

  return (
    <div className="space-y-6">
      {/* Org selector */}
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a client..." />
          </SelectTrigger>
          <SelectContent>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedOrg && (
        <OnboardingSettings
          organizationId={selectedOrg.id}
          organizationName={selectedOrg.name}
        />
      )}

      {orgs.length === 0 && (
        <p className="text-sm text-muted-foreground">No client organisations found.</p>
      )}
    </div>
  )
}
