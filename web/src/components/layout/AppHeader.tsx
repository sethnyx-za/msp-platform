import type { SessionUser } from "@/types"
import { UserNav } from "./UserNav"

interface AppHeaderProps {
  user: SessionUser
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
      {/* Left side — breadcrumb placeholder (populated per page in future) */}
      <div />

      {/* Right side — user menu */}
      <div className="flex items-center gap-3">
        <UserNav user={user} />
      </div>
    </header>
  )
}
