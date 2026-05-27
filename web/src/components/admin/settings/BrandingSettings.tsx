"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Upload, Palette } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

const COLOR_SWATCHES = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#dc2626", // red
  "#d97706", // amber
  "#16a34a", // green
  "#0891b2", // cyan
  "#0f172a", // slate dark
]

const schema = z.object({
  companyName: z.string().min(1).max(100),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  reportHeaderHtml: z.string().nullable().optional(),
  reportFooterHtml: z.string().nullable().optional(),
  emailFooterHtml: z.string().nullable().optional(),
  customCss: z.string().nullable().optional(),
})
type FormData = z.infer<typeof schema>

export default function BrandingSettings() {
  const qc = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ success: boolean; data: Record<string, unknown> | null }>({
    queryKey: ["msp-branding"],
    queryFn: () => fetch("/api/admin/settings/branding").then((r) => r.json()),
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: "", primaryColor: "", accentColor: "", reportHeaderHtml: "", reportFooterHtml: "", emailFooterHtml: "", customCss: "" },
  })

  useEffect(() => {
    if (data?.data) {
      const d = data.data as Record<string, string>
      form.reset({
        companyName: d.companyName ?? "",
        primaryColor: d.primaryColor ?? "",
        accentColor: d.accentColor ?? "",
        reportHeaderHtml: d.reportHeaderHtml ?? "",
        reportFooterHtml: d.reportFooterHtml ?? "",
        emailFooterHtml: d.emailFooterHtml ?? "",
        customCss: d.customCss ?? "",
      })
      setLogoUrl(d.logoUrl ?? null)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const payload = {
        ...values,
        primaryColor: values.primaryColor || null,
        accentColor: values.accentColor || null,
        reportHeaderHtml: values.reportHeaderHtml || null,
        reportFooterHtml: values.reportFooterHtml || null,
        emailFooterHtml: values.emailFooterHtml || null,
        customCss: values.customCss || null,
        ...(logoUrl && { logoUrl }),
      }
      const res = await fetch("/api/admin/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => {
      toast.success("Branding settings saved")
      qc.invalidateQueries({ queryKey: ["msp-branding"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("category", "logos")
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setLogoUrl(`/uploads/${json.data.relativePath}`)
      toast.success("Logo uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setLogoUploading(false)
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identity</CardTitle>
            <CardDescription>Company name and logo shown throughout the platform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="companyName" render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name *</FormLabel>
                <FormControl><Input placeholder="Acme IT Solutions" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="space-y-2">
              <FormLabel>Company Logo</FormLabel>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-12 w-auto rounded border object-contain" />
                ) : (
                  <div className="h-12 w-24 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No logo
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                  <Upload className="h-4 w-4 mr-2" />
                  {logoUploading ? "Uploading..." : "Upload Logo"}
                </Button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Max 50MB.</p>
            </div>
          </CardContent>
        </Card>

        {/* Colours */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Brand Colours
            </CardTitle>
            <CardDescription>These override the default theme for all users in your portal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <FormField control={form.control} name="primaryColor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Colour</FormLabel>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: field.value === c ? "hsl(var(--foreground))" : "transparent" }}
                        onClick={() => field.onChange(c)}
                      />
                    ))}
                  </div>
                  <FormControl>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={field.value || "#2563eb"} onChange={(e) => field.onChange(e.target.value)} className="h-9 w-12 rounded cursor-pointer border" />
                      <Input placeholder="#2563eb" {...field} className="font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="accentColor" render={({ field }) => (
                <FormItem>
                  <FormLabel>Accent Colour</FormLabel>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: field.value === c ? "hsl(var(--foreground))" : "transparent" }}
                        onClick={() => field.onChange(c)}
                      />
                    ))}
                  </div>
                  <FormControl>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={field.value || "#7c3aed"} onChange={(e) => field.onChange(e.target.value)} className="h-9 w-12 rounded cursor-pointer border" />
                      <Input placeholder="#7c3aed" {...field} className="font-mono" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* Report templates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Report Templates</CardTitle>
            <CardDescription>HTML rendered in PDF reports (supports inline styles)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="reportHeaderHtml" render={({ field }) => (
              <FormItem>
                <FormLabel>Report Header HTML</FormLabel>
                <FormControl>
                  <Textarea placeholder='<div style="text-align:right"><img src="/logo.png" height="40"/></div>' rows={4} {...field} value={field.value ?? ""} className="font-mono text-xs" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reportFooterHtml" render={({ field }) => (
              <FormItem>
                <FormLabel>Report Footer HTML</FormLabel>
                <FormControl>
                  <Textarea placeholder='<p style="font-size:10px;color:#888">Confidential — {clientName}</p>' rows={3} {...field} value={field.value ?? ""} className="font-mono text-xs" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Email footer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email Footer</CardTitle>
            <CardDescription>Appended to all outbound notification emails</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField control={form.control} name="emailFooterHtml" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea placeholder='<p>© 2025 Acme IT | <a href="tel:+27210000000">+27 21 000 0000</a></p>' rows={3} {...field} value={field.value ?? ""} className="font-mono text-xs" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        <Separator />
        <div className="flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Branding"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
