"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Package, Plus, Search, MoreHorizontal, Pencil, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { formatCurrency } from "@/lib/utils"

const CATEGORIES = [
  "Computer", "Laptop", "Peripheral", "Screen / Monitor",
  "Printer", "Server", "Network Equipment", "License / Software",
  "Service", "Other",
]

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().or(z.literal("")),
  sku: z.string().max(100).optional().or(z.literal("")),
  category: z.string().max(100).optional().or(z.literal("")),
  supplier: z.string().max(255).optional().or(z.literal("")),
  unitPrice: z.coerce.number().min(0, "Price must be ≥ 0"),
  currency: z.string().length(3).default("ZAR"),
})
type FormData = z.infer<typeof schema>

interface CatalogItem {
  id: string
  name: string
  description: string | null
  sku: string | null
  category: string | null
  supplier: string | null
  unitPrice: string
  currency: string
  isActive: boolean
}

export default function CatalogManager() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const dSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CatalogItem | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["catalog", dSearch, page, showInactive],
    queryFn: () =>
      fetch(`/api/admin/catalog?search=${encodeURIComponent(dSearch)}&page=${page}&limit=50&active=${!showInactive}`).then((r) => r.json()),
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", sku: "", category: "", supplier: "", unitPrice: 0, currency: "ZAR" },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const payload = {
        ...values,
        description: values.description || null,
        sku: values.sku || null,
        category: values.category || null,
        supplier: values.supplier || null,
      }
      const url = editTarget ? `/api/admin/catalog/${editTarget.id}` : "/api/admin/catalog"
      const method = editTarget ? "PATCH" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => {
      toast.success(editTarget ? "Item updated" : "Item created")
      qc.invalidateQueries({ queryKey: ["catalog"] })
      setDialogOpen(false)
      form.reset()
      setEditTarget(null)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/catalog/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Item archived")
      qc.invalidateQueries({ queryKey: ["catalog"] })
    },
    onError: () => toast.error("Failed to archive item"),
  })

  const openDialog = (item?: CatalogItem) => {
    setEditTarget(item ?? null)
    if (item) {
      form.reset({
        name: item.name,
        description: item.description ?? "",
        sku: item.sku ?? "",
        category: item.category ?? "",
        supplier: item.supplier ?? "",
        unitPrice: parseFloat(item.unitPrice),
        currency: item.currency,
      })
    } else {
      form.reset({ name: "", description: "", sku: "", category: "", supplier: "", unitPrice: 0, currency: "ZAR" })
    }
    setDialogOpen(true)
  }

  const items: CatalogItem[] = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide archived" : "Show archived"}
          </Button>
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Price</TableHead>
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
              : items.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    {search ? "No items match your search" : "No catalog items yet. Add your first product or service."}
                  </TableCell>
                </TableRow>
              )
              : items.map((item) => (
                <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <p className="font-medium text-sm">{item.name}</p>
                    {item.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</p>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.sku ?? "—"}</TableCell>
                  <TableCell>
                    {item.category ? <Badge variant="outline" className="text-xs">{item.category}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.supplier ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium text-sm">
                    {formatCurrency(parseFloat(item.unitPrice), item.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "success" : "secondary"}>
                      {item.isActive ? "Active" : "Archived"}
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
                        <DropdownMenuItem onClick={() => openDialog(item)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        {item.isActive && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => archiveMutation.mutate(item.id)}
                          >
                            <Archive className="h-4 w-4 mr-2" /> Archive
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} items total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Item" : "Add Catalog Item"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input placeholder="Dell Latitude 5440" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input placeholder="DELL-LAT-5440" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="unitPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Price (ZAR) *</FormLabel>
                    <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl><Input placeholder="Dell Technologies" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea placeholder="14-inch business laptop, i5, 16GB RAM..." rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : editTarget ? "Save Changes" : "Add Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
