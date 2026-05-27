"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, CheckCircle2, XCircle, Send, Inbox } from "lucide-react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  provider: z.enum(["smtp", "zoho", "gmail", "m365"]),
  fromName: z.string().max(255).optional().or(z.literal("")),
  fromAddress: z.string().email().max(255).optional().or(z.literal("")),
  // SMTP / Zoho fields
  smtpHost: z.string().max(255).optional().or(z.literal("")),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().max(255).optional().or(z.literal("")),
  smtpPassword: z.string().max(500).optional().or(z.literal("")),
  smtpSecure: z.boolean().default(false),
  // OAuth2 fields
  oauthClientId: z.string().max(255).optional().or(z.literal("")),
  oauthClientSecret: z.string().max(500).optional().or(z.literal("")),
  oauthRefreshToken: z.string().max(1000).optional().or(z.literal("")),
  oauthTenantId: z.string().max(255).optional().or(z.literal("")),
  // IMAP fields
  imapHost: z.string().max(255).optional().or(z.literal("")),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapUser: z.string().max(255).optional().or(z.literal("")),
  imapPassword: z.string().max(500).optional().or(z.literal("")),
  imapTls: z.boolean().default(true),
  imapMailbox: z.string().max(100).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

type FormData = z.infer<typeof schema>

type ConfigData = {
  id: string
  provider: string
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  smtpPasswordSet: boolean
  smtpSecure: boolean | null
  fromName: string | null
  fromAddress: string | null
  oauthClientId: string | null
  oauthClientSecretSet: boolean
  oauthRefreshTokenSet: boolean
  oauthTenantId: string | null
  imapHost: string | null
  imapPort: number | null
  imapUser: string | null
  imapPasswordSet: boolean
  imapTls: boolean | null
  imapMailbox: string | null
  isActive: boolean
  lastTestedAt: string | null
  lastTestSuccess: boolean | null
  lastTestError: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailConfigForm() {
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testingImap, setTestingImap] = useState(false)

  const { data, isLoading, refetch } = useQuery<{ data: ConfigData | null }>({
    queryKey: ["admin", "settings", "email"],
    queryFn: () => fetch("/api/admin/settings/email").then((r) => r.json()),
  })

  const config = data?.data

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: "smtp",
      smtpPort: 587,
      smtpSecure: false,
      imapPort: 993,
      imapTls: true,
      imapMailbox: "INBOX",
      isActive: true,
    },
  })

  const provider = form.watch("provider")

  // Populate form when data loads
  useEffect(() => {
    if (config) {
      form.reset({
        provider: (config.provider as FormData["provider"]) ?? "smtp",
        fromName: config.fromName ?? "",
        fromAddress: config.fromAddress ?? "",
        smtpHost: config.smtpHost ?? "",
        smtpPort: config.smtpPort ?? 587,
        smtpUser: config.smtpUser ?? "",
        smtpPassword: "",  // never pre-fill passwords
        smtpSecure: config.smtpSecure ?? false,
        oauthClientId: config.oauthClientId ?? "",
        oauthClientSecret: "",
        oauthRefreshToken: "",
        oauthTenantId: config.oauthTenantId ?? "",
        imapHost: config.imapHost ?? "",
        imapPort: config.imapPort ?? 993,
        imapUser: config.imapUser ?? "",
        imapPassword: "",
        imapTls: config.imapTls ?? true,
        imapMailbox: config.imapMailbox ?? "INBOX",
        isActive: config.isActive,
      })
    }
  }, [config, form])

  const mutation = useMutation({
    mutationFn: async (values: FormData) => {
      // Strip empty strings → undefined so backend doesn't overwrite with empty
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v === "" ? undefined : v]),
      )
      const res = await fetch("/api/admin/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Save failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Email settings saved")
      refetch()
    },
    onError: () => toast.error("Failed to save email settings"),
  })

  async function testConnection(type: "smtp" | "imap") {
    const setter = type === "smtp" ? setTestingSmtp : setTestingImap
    setter(true)
    try {
      const res = await fetch("/api/admin/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      const json = await res.json()
      if (json.ok) {
        toast.success(`${type.toUpperCase()} connection successful`)
      } else {
        toast.error(`${type.toUpperCase()} test failed: ${json.error ?? "unknown error"}`)
      }
      refetch()
    } catch {
      toast.error("Connection test failed")
    } finally {
      setter(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="h-32 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent></Card>
        ))}
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">

        {/* Status banner */}
        {config && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            {config.lastTestSuccess === true && (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            )}
            {config.lastTestSuccess === false && (
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
            )}
            <div className="text-sm">
              {config.lastTestSuccess === true && (
                <span className="text-green-700 dark:text-green-400">
                  Last SMTP test passed on {new Date(config.lastTestedAt!).toLocaleString()}
                </span>
              )}
              {config.lastTestSuccess === false && (
                <span className="text-destructive">
                  Last test failed: {config.lastTestError}
                </span>
              )}
              {config.lastTestSuccess === null && (
                <span className="text-muted-foreground">Connection not tested yet</span>
              )}
            </div>
          </div>
        )}

        {/* ── Provider + From ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outbound Email Provider</CardTitle>
            <CardDescription>Configure how the platform sends email notifications and reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            <FormField control={form.control} name="provider" render={({ field }) => (
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="smtp">Generic SMTP</SelectItem>
                    <SelectItem value="zoho">Zoho Mail</SelectItem>
                    <SelectItem value="gmail">Gmail (OAuth2)</SelectItem>
                    <SelectItem value="m365">Microsoft 365 (OAuth2)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fromName" render={({ field }) => (
                <FormItem>
                  <FormLabel>From Name</FormLabel>
                  <FormControl><Input placeholder="MSP Support" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="fromAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>From Email</FormLabel>
                  <FormControl><Input type="email" placeholder="support@yourmsp.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div>
                  <FormLabel className="cursor-pointer">Active</FormLabel>
                  <FormDescription className="text-xs">Disable to pause all outbound emails</FormDescription>
                </div>
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* ── SMTP fields (smtp / zoho) ──────────────────────────────────────── */}
        {(provider === "smtp" || provider === "zoho") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {provider === "zoho" ? "Zoho SMTP Settings" : "SMTP Settings"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider === "zoho" && (
                <p className="text-xs text-muted-foreground">
                  Zoho defaults: <code>smtp.zoho.com:465</code>, TLS on connect.
                  Enter your Zoho email address as the username.
                </p>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <FormField control={form.control} name="smtpHost" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Host</FormLabel>
                      <FormControl>
                        <Input placeholder={provider === "zoho" ? "smtp.zoho.com" : "mail.example.com"} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="smtpPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder={provider === "zoho" ? "465" : "587"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="smtpUser" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl><Input placeholder="user@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="smtpPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Password
                      {config?.smtpPasswordSet && (
                        <Badge variant="outline" className="ml-2 text-xs font-normal">set — leave blank to keep</Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={config?.smtpPasswordSet ? "••••••••" : "Enter password"} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {provider === "smtp" && (
                <FormField control={form.control} name="smtpSecure" render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div>
                      <FormLabel className="cursor-pointer">TLS on connect (port 465)</FormLabel>
                      <FormDescription className="text-xs">Disable for STARTTLS (port 587)</FormDescription>
                    </div>
                  </FormItem>
                )} />
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection("smtp")}
                  disabled={testingSmtp}
                >
                  {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Test SMTP
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── OAuth2 fields (gmail / m365) ──────────────────────────────────── */}
        {(provider === "gmail" || provider === "m365") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {provider === "gmail" ? "Google OAuth2 Credentials" : "Microsoft 365 OAuth2 Credentials"}
              </CardTitle>
              <CardDescription>
                {provider === "gmail"
                  ? "Create a Google Cloud OAuth2 client, generate a refresh token, and paste it here."
                  : "Register an Entra ID app, grant Mail.Send permission, generate a refresh token, and paste it here."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="smtpUser" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sending Email Address</FormLabel>
                  <FormControl><Input type="email" placeholder="you@gmail.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="oauthClientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client ID</FormLabel>
                  <FormControl><Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="oauthClientSecret" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Client Secret
                    {config?.oauthClientSecretSet && (
                      <Badge variant="outline" className="ml-2 text-xs font-normal">set — leave blank to keep</Badge>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={config?.oauthClientSecretSet ? "••••••••" : "Paste client secret"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="oauthRefreshToken" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Refresh Token
                    {config?.oauthRefreshTokenSet && (
                      <Badge variant="outline" className="ml-2 text-xs font-normal">set — leave blank to keep</Badge>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={config?.oauthRefreshTokenSet ? "••••••••" : "Paste refresh token"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {provider === "m365" && (
                <FormField control={form.control} name="oauthTenantId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant ID</FormLabel>
                    <FormControl><Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" {...field} /></FormControl>
                    <FormDescription className="text-xs">Your Azure tenant ID (or &quot;common&quot; for multi-tenant)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testConnection("smtp")}
                  disabled={testingSmtp}
                >
                  {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── IMAP inbound ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">IMAP Inbound (Optional)</CardTitle>
            <CardDescription>
              Poll a mailbox to process approval replies and ticket updates automatically.
              Subject tags <code>[REVIEW-…]</code> and <code>[TICKET-…]</code> are matched.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <FormField control={form.control} name="imapHost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IMAP Host</FormLabel>
                    <FormControl><Input placeholder="imap.example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="imapPort" render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl><Input type="number" placeholder="993" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="imapUser" render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl><Input placeholder="support@yourmsp.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imapPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Password
                    {config?.imapPasswordSet && (
                      <Badge variant="outline" className="ml-2 text-xs font-normal">set — leave blank to keep</Badge>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={config?.imapPasswordSet ? "••••••••" : "Enter password"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="imapMailbox" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mailbox</FormLabel>
                  <FormControl><Input placeholder="INBOX" {...field} /></FormControl>
                  <FormDescription className="text-xs">Folder to poll for replies</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imapTls" render={({ field }) => (
                <FormItem className="flex items-center gap-3 mt-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel className="cursor-pointer">TLS / SSL</FormLabel>
                    <FormDescription className="text-xs">Disable for STARTTLS (port 143)</FormDescription>
                  </div>
                </FormItem>
              )} />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => testConnection("imap")}
                disabled={testingImap}
              >
                {testingImap ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Inbox className="h-4 w-4 mr-2" />}
                Test IMAP
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Email Settings
          </Button>
        </div>
      </form>
    </Form>
  )
}
