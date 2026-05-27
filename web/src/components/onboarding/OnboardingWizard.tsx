"use client"

import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import {
  User, Package, Key, FileCheck, Plus, Trash2, Search,
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string // local uuid for react key
  catalogItemId: string | null
  category: string
  description: string
  sku: string
  supplier: string
  quantity: number
  unitPrice: number
}

interface CatalogItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  supplier: string | null
  unitPrice: string
  currency: string
}

interface Location { id: string; name: string; description: string | null }
interface Resource { id: string; name: string; description: string | null }

const LINE_ITEM_CATEGORIES = [
  { value: "computer", label: "Computer" },
  { value: "peripheral", label: "Peripheral" },
  { value: "monitor", label: "Monitor" },
  { value: "license", label: "License / Software" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
]

// ─── Step 1 schema ────────────────────────────────────────────────────────────

const step1Schema = z.object({
  starterFirstName: z.string().min(1, "First name is required").max(100),
  starterLastName: z.string().min(1, "Last name is required").max(100),
  starterEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  starterPhone: z.string().max(50).optional().or(z.literal("")),
  starterJobTitle: z.string().max(255).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  phoneExtension: z.string().max(20).optional().or(z.literal("")),
})
type Step1Data = z.infer<typeof step1Schema>

const STEPS = [
  { label: "Starter Details", icon: User },
  { label: "Equipment", icon: Package },
  { label: "Access & Resources", icon: Key },
  { label: "Review & Submit", icon: FileCheck },
]

function localId() {
  return Math.random().toString(36).slice(2)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)

  // Step 2 state
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [catalogSearch, setCatalogSearch] = useState("")
  const [showCatalogSearch, setShowCatalogSearch] = useState(false)

  // Step 3 state
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [selectedResources, setSelectedResources] = useState<string[]>([])

  // Step 4 state
  const [quoteNotes, setQuoteNotes] = useState("")

  // Step 1 form
  const form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      starterFirstName: "", starterLastName: "",
      starterEmail: "", starterPhone: "",
      starterJobTitle: "", startDate: "", phoneExtension: "",
    },
  })

  const step1 = form.watch()

  // Fetch options (locations + resources)
  const { data: optionsData } = useQuery({
    queryKey: ["onboarding-options"],
    queryFn: () => fetch("/api/onboarding/options").then((r) => r.json()),
  })
  const locations: Location[] = optionsData?.data?.locations ?? []
  const resources: Resource[] = optionsData?.data?.resources ?? []

  // Catalog search
  const { data: catalogData } = useQuery({
    queryKey: ["catalog-search", catalogSearch],
    queryFn: () => fetch(`/api/catalog?search=${encodeURIComponent(catalogSearch)}&limit=20`).then((r) => r.json()),
    enabled: showCatalogSearch && catalogSearch.length >= 1,
    staleTime: 30_000,
  })
  const catalogResults: CatalogItem[] = catalogData?.data ?? []

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (action: "draft" | "submit") => {
      const data = form.getValues()
      const payload = {
        starterFirstName: data.starterFirstName,
        starterLastName: data.starterLastName,
        starterEmail: data.starterEmail || null,
        starterPhone: data.starterPhone || null,
        starterJobTitle: data.starterJobTitle || null,
        startDate: data.startDate || null,
        phoneExtension: data.phoneExtension || null,
        lineItems: lineItems.map((i, idx) => ({
          catalogItemId: i.catalogItemId,
          category: i.category,
          description: i.description,
          sku: i.sku || null,
          supplier: i.supplier || null,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          sortOrder: idx,
        })),
        selectedLocationIds: selectedLocations,
        selectedResourceIds: selectedResources,
        quoteNotes: quoteNotes || null,
        action,
      }
      const res = await fetch("/api/onboarding/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed to submit")
      return json.data
    },
    onSuccess: (data, action) => {
      qc.invalidateQueries({ queryKey: ["onboarding-history"] })
      if (action === "submit") {
        toast.success("Onboarding request submitted for approval!")
        router.push(`/onboarding/${data.id}`)
      } else {
        toast.success("Draft saved")
        router.push(`/onboarding/${data.id}`)
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Line item helpers ──────────────────────────────────────────────────────

  const addFromCatalog = useCallback((item: CatalogItem) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: localId(),
        catalogItemId: item.id,
        category: mapCatalogCategory(item.category),
        description: item.name,
        sku: item.sku ?? "",
        supplier: item.supplier ?? "",
        quantity: 1,
        unitPrice: parseFloat(item.unitPrice),
      },
    ])
    setCatalogSearch("")
    setShowCatalogSearch(false)
  }, [])

  const addCustomItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      { id: localId(), catalogItemId: null, category: "other", description: "", sku: "", supplier: "", quantity: 1, unitPrice: 0 },
    ])
  }, [])

  const updateLineItem = useCallback((id: string, field: keyof LineItem, value: unknown) => {
    setLineItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
  }, [])

  const removeLineItem = useCallback((id: string) => {
    setLineItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const total = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  // ── Step navigation ────────────────────────────────────────────────────────

  const goNext = async () => {
    if (step === 0) {
      const valid = await form.trigger()
      if (!valid) return
    }
    setStep((s) => Math.min(s + 1, 3))
  }

  const goPrev = () => setStep((s) => Math.max(s - 1, 0))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = i === step
          const done = i < step
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-default ${
                  active ? "bg-primary text-primary-foreground" :
                  done ? "text-primary" :
                  "text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className={`h-4 w-4 mx-1 ${done ? "text-primary" : "text-muted-foreground/40"}`} />
              )}
            </div>
          )
        })}
      </div>

      <Separator />

      {/* ── Step 0: Starter Details ── */}
      {step === 0 && (
        <Form {...form}>
          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="starterFirstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl><Input placeholder="Jane" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="starterLastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl><Input placeholder="Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="starterEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Email</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="starterPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input placeholder="+27 82 000 0000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="starterJobTitle" render={({ field }) => (
              <FormItem>
                <FormLabel>Job Title</FormLabel>
                <FormControl><Input placeholder="Senior Developer" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phoneExtension" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Extension</FormLabel>
                  <FormControl><Input placeholder="1234" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>
        </Form>
      )}

      {/* ── Step 1: Equipment ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Catalog search */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search catalog..."
                className="pl-9"
                value={catalogSearch}
                onChange={(e) => { setCatalogSearch(e.target.value); setShowCatalogSearch(true) }}
                onFocus={() => setShowCatalogSearch(true)}
              />
              {showCatalogSearch && catalogSearch.length >= 1 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-popover border rounded-md shadow-md max-h-64 overflow-y-auto">
                  {catalogResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No items found</p>
                  ) : (
                    catalogResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                        onClick={() => addFromCatalog(item)}
                      >
                        <span>
                          <span className="font-medium">{item.name}</span>
                          {item.sku && <span className="text-muted-foreground ml-2 font-mono text-xs">{item.sku}</span>}
                        </span>
                        <span className="text-muted-foreground">{formatCurrency(parseFloat(item.unitPrice), item.currency)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button variant="outline" onClick={addCustomItem} type="button">
              <Plus className="h-4 w-4 mr-2" /> Custom Item
            </Button>
          </div>

          {/* Line items table */}
          {lineItems.length === 0 ? (
            <div className="border rounded-lg py-10 text-center text-muted-foreground">
              <Package className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No items yet. Search the catalog or add a custom item.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lineItems.map((item) => (
                <Card key={item.id} className="p-0">
                  <CardContent className="p-3">
                    <div className="grid grid-cols-12 gap-2 items-start">
                      {/* Category */}
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
                        <Select value={item.category} onValueChange={(v) => updateLineItem(item.id, "category", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LINE_ITEM_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Description */}
                      <div className="col-span-4">
                        <Label className="text-xs text-muted-foreground mb-1 block">Description *</Label>
                        <Input
                          className="h-8 text-sm"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                          placeholder="Item name"
                        />
                      </div>
                      {/* Qty */}
                      <div className="col-span-1">
                        <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                        <Input
                          type="number" min="1" className="h-8 text-sm"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                        />
                      </div>
                      {/* Unit Price */}
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Unit Price</Label>
                        <Input
                          type="number" min="0" step="0.01" className="h-8 text-sm"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      {/* Total */}
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground mb-1 block">Total</Label>
                        <div className="h-8 flex items-center font-medium text-sm">
                          {formatCurrency(item.unitPrice * item.quantity, "ZAR")}
                        </div>
                      </div>
                      {/* Delete */}
                      <div className="col-span-1 flex items-end justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeLineItem(item.id)} type="button">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* SKU + Supplier (collapsed) */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">SKU</Label>
                        <Input className="h-7 text-xs font-mono" placeholder="optional" value={item.sku}
                          onChange={(e) => updateLineItem(item.id, "sku", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Supplier</Label>
                        <Input className="h-7 text-xs" placeholder="optional" value={item.supplier}
                          onChange={(e) => updateLineItem(item.id, "supplier", e.target.value)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Total */}
              <div className="flex justify-end pt-2">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Quote</p>
                  <p className="text-2xl font-bold">{formatCurrency(total, "ZAR")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Access & Resources ── */}
      {step === 2 && (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Locations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Building Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations configured.</p>
              ) : locations.map((loc) => (
                <div key={loc.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`loc-${loc.id}`}
                    checked={selectedLocations.includes(loc.id)}
                    onCheckedChange={(v) =>
                      setSelectedLocations((prev) =>
                        v ? [...prev, loc.id] : prev.filter((id) => id !== loc.id)
                      )
                    }
                  />
                  <label htmlFor={`loc-${loc.id}`} className="cursor-pointer">
                    <p className="text-sm font-medium">{loc.name}</p>
                    {loc.description && <p className="text-xs text-muted-foreground">{loc.description}</p>}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Shared Resources */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Shared Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {resources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shared resources configured.</p>
              ) : resources.map((res) => (
                <div key={res.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`res-${res.id}`}
                    checked={selectedResources.includes(res.id)}
                    onCheckedChange={(v) =>
                      setSelectedResources((prev) =>
                        v ? [...prev, res.id] : prev.filter((id) => id !== res.id)
                      )
                    }
                  />
                  <label htmlFor={`res-${res.id}`} className="cursor-pointer">
                    <p className="text-sm font-medium">{res.name}</p>
                    {res.description && <p className="text-xs text-muted-foreground">{res.description}</p>}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 3: Review & Submit ── */}
      {step === 3 && (
        <div className="space-y-4 max-w-2xl">
          {/* Starter summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" /> Starter Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{step1.starterFirstName} {step1.starterLastName}</p></div>
              {step1.starterJobTitle && <div><p className="text-xs text-muted-foreground">Job Title</p><p className="font-medium">{step1.starterJobTitle}</p></div>}
              {step1.startDate && <div><p className="text-xs text-muted-foreground">Start Date</p><p className="font-medium">{step1.startDate}</p></div>}
              {step1.starterEmail && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{step1.starterEmail}</p></div>}
              {step1.starterPhone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{step1.starterPhone}</p></div>}
              {step1.phoneExtension && <div><p className="text-xs text-muted-foreground">Extension</p><p className="font-medium">{step1.phoneExtension}</p></div>}
            </CardContent>
          </Card>

          {/* Equipment summary */}
          {lineItems.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" /> Equipment & Services ({lineItems.length} items)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {lineItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span>{item.description} {item.quantity > 1 && <span className="text-muted-foreground">× {item.quantity}</span>}</span>
                    <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity, "ZAR")}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(total, "ZAR")}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Access summary */}
          {(selectedLocations.length > 0 || selectedResources.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4" /> Access & Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {selectedLocations.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Building Access</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedLocations.map((id) => {
                        const loc = locations.find((l) => l.id === id)
                        return loc ? <Badge key={id} variant="outline" className="text-xs">{loc.name}</Badge> : null
                      })}
                    </div>
                  </div>
                )}
                {selectedResources.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Shared Resources</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedResources.map((id) => {
                        const res = resources.find((r) => r.id === id)
                        return res ? <Badge key={id} variant="outline" className="text-xs">{res.name}</Badge> : null
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="quoteNotes">Additional Notes (optional)</Label>
            <Textarea
              id="quoteNotes"
              placeholder="Any special requirements or notes for the IT team..."
              rows={3}
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <Separator />
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={step === 0} type="button">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="flex gap-2">
          {step === 3 && (
            <Button variant="outline" onClick={() => submitMutation.mutate("draft")}
              disabled={submitMutation.isPending} type="button">
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save as Draft
            </Button>
          )}

          {step < 3 ? (
            <Button onClick={goNext} type="button">
              Next <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => submitMutation.mutate("submit")}
              disabled={submitMutation.isPending} type="button">
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit for Approval
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapCatalogCategory(cat: string | null): string {
  if (!cat) return "other"
  const c = cat.toLowerCase()
  if (c.includes("computer") || c.includes("laptop")) return "computer"
  if (c.includes("screen") || c.includes("monitor")) return "monitor"
  if (c.includes("printer")) return "peripheral"
  if (c.includes("server")) return "computer"
  if (c.includes("license") || c.includes("software")) return "license"
  if (c.includes("service")) return "service"
  return "other"
}
