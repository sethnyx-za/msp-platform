"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Plus, Search, MoreHorizontal, Pencil, PowerOff, Power, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { useDebounce } from "@/lib/hooks/useDebounce"
import type { ApiResponse, PaginatedResponse } from "@/types"
import ClientDialog from "./ClientDialog"
import Link from "next/link"

interface Organization {
  id: string
  name: string
  slug: string
  parentId: string | null
  isMaster: boolean
  isActive: boolean
  address: string | null
  phone: string | null
  website: string | null
  slaHoursResponse: number | null
  slaHoursResolution: number | null
  createdAt: string
}

export default function ClientsTable() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const dSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Organization | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Organization | null>(null)

  const { data, isLoading } = useQuery<ApiResponse<PaginatedResponse<Organization>>>({
    queryKey: ["admin-clients", dSearch, page],
    queryFn: () =>
      fetch(`/api/admin/clients?search=${encodeURIComponent(dSearch)}&page=${page}&limit=20`).then((r) => r.json()),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/clients/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Client deactivated")
      qc.invalidateQueries({ queryKey: ["admin-clients"] })
      setDeactivateTarget(null)
    },
    onError: () => toast.error("Failed to deactivate client"),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/clients/${id}?action=reactivate`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Client reactivated")
      qc.invalidateQueries({ queryKey: ["admin-clients"] })
    },
    onError: () => toast.error("Failed to reactivate client"),
  })

  const clients = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>SLA (Resp/Res)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : clients.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Building2 className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    {search ? "No clients match your search" : "No clients yet"}
                  </TableCell>
                </TableRow>
              )
              : clients.map((client) => (
                <TableRow key={client.id} className={!client.isActive ? "opacity-60" : ""}>
                  <TableCell>
                    <Link href={`/admin/clients/${client.id}`} className="font-medium hover:underline flex items-center gap-1">
                      {client.name}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                    {client.parentId && <p className="text-xs text-muted-foreground mt-0.5">Child org</p>}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{client.slug}</TableCell>
                  <TableCell>
                    {client.isMaster ? (
                      <Badge variant="secondary">Master</Badge>
                    ) : client.parentId ? (
                      <Badge variant="outline">Branch</Badge>
                    ) : (
                      <Badge variant="outline">Standard</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.slaHoursResponse ?? "—"}h / {client.slaHoursResolution ?? "—"}h
                  </TableCell>
                  <TableCell>
                    <Badge variant={client.isActive ? "success" : "secondary"}>
                      {client.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditTarget(client); setDialogOpen(true) }}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {client.isActive ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeactivateTarget(client)}
                          >
                            <PowerOff className="h-4 w-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => reactivateMutation.mutate(client.id)}>
                            <Power className="h-4 w-4 mr-2" /> Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} clients total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="flex items-center px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ClientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-clients"] })}
      />

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent all users in this organisation from logging in. You can reactivate it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
