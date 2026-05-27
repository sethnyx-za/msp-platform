"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Users, Plus, Search, MoreHorizontal, Pencil, PowerOff, Power, KeyRound, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { getInitials, formatDateTime } from "@/lib/utils"
import UserDialog from "./UserDialog"

interface Membership {
  id: string
  organizationId: string
  role: string
  isPrimary: boolean
  organization: { id: string; name: string }
}

interface User {
  id: string
  email: string
  name: string | null
  isMspStaff: boolean
  isActive: boolean
  totpEnabled: boolean
  mustChangePwd: boolean
  lastLoginAt: string | null
  createdAt: string
  memberships: Membership[]
}

export default function UsersTable() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const dSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [disableMfaTarget, setDisableMfaTarget] = useState<User | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", dSearch, page],
    queryFn: () =>
      fetch(`/api/admin/users?search=${encodeURIComponent(dSearch)}&page=${page}&limit=20`).then((r) => r.json()),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/users/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("User deactivated")
      qc.invalidateQueries({ queryKey: ["admin-users"] })
      setDeactivateTarget(null)
    },
    onError: () => toast.error("Failed to deactivate user"),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/users/${id}?action=reactivate`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("User reactivated")
      qc.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: () => toast.error("Failed to reactivate user"),
  })

  const disableMfaMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/users/${id}?action=disable-mfa`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("MFA disabled for user")
      qc.invalidateQueries({ queryKey: ["admin-users"] })
      setDisableMfaTarget(null)
    },
    onError: () => toast.error("Failed to disable MFA"),
  })

  const users: User[] = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const roleColour = (role: string) => {
    if (role.startsWith("msp_")) return "warning"
    if (role === "client_admin") return "info"
    if (role === "client_approver") return "secondary"
    return "outline"
  }

  const primaryMembership = (u: User) =>
    u.memberships.find((m) => m.isPrimary) ?? u.memberships[0]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>MFA</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : users.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    {search ? "No users match your search" : "No users yet"}
                  </TableCell>
                </TableRow>
              )
              : users.map((user) => {
                const primary = primaryMembership(user)
                return (
                  <TableRow key={user.id} className={!user.isActive ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(user.name ?? user.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{user.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {primary?.organization.name ?? "—"}
                      {user.memberships.length > 1 && (
                        <span className="text-xs text-muted-foreground ml-1">+{user.memberships.length - 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {primary && (
                        <Badge variant={roleColour(primary.role) as "warning" | "info" | "secondary" | "outline"}>
                          {primary.role.replace("_", " ")}
                        </Badge>
                      )}
                      {user.isMspStaff && <Badge variant="warning" className="ml-1">MSP</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.totpEnabled ? "success" : "outline"}>
                        {user.totpEnabled ? "Enabled" : "Off"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "secondary"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {user.mustChangePwd && (
                        <Badge variant="warning" className="ml-1">Pwd Reset</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditTarget(user); setDialogOpen(true) }}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            // Trigger password reset dialog — reuse UserDialog with action
                            setEditTarget({ ...user, mustChangePwd: true })
                            setDialogOpen(true)
                          }}>
                            <KeyRound className="h-4 w-4 mr-2" /> Reset Password
                          </DropdownMenuItem>
                          {user.totpEnabled && (
                            <DropdownMenuItem onClick={() => setDisableMfaTarget(user)}>
                              <ShieldOff className="h-4 w-4 mr-2" /> Disable MFA
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {user.isActive ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeactivateTarget(user)}
                            >
                              <PowerOff className="h-4 w-4 mr-2" /> Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => reactivateMutation.mutate(user.id)}>
                              <Power className="h-4 w-4 mr-2" /> Reactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} users total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>This will prevent the user from logging in. You can reactivate them at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
            >Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!disableMfaTarget} onOpenChange={(o) => !o && setDisableMfaTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable MFA for {disableMfaTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>The user will need to set up MFA again on next login. Only do this if the user has lost access to their authenticator.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => disableMfaTarget && disableMfaMutation.mutate(disableMfaTarget.id)}>
              Disable MFA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
