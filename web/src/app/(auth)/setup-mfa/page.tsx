"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ShieldCheck, Copy, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

const schema = z.object({
  code: z.string().length(6, "Must be 6 digits").regex(/^\d+$/, "Digits only"),
})
type Form = z.infer<typeof schema>

export default function SetupMfaPage() {
  const router = useRouter()
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [copied, setCopied] = useState(false)

  const form = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    fetch("/api/auth/setup-mfa")
      .then((r) => r.json())
      .then((data) => {
        setQrCode(data.qrCode)
        setSecret(data.secret)
      })
      .catch(() => toast.error("Failed to load MFA setup"))
      .finally(() => setFetching(false))
  }, [])

  async function handleSubmit(data: Form) {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/setup-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success("MFA enabled! Your account is now protected.")
      router.push("/profile")
    } catch {
      toast.error("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function copySecret() {
    if (!secret) return
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (fetching) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-white">Set up authenticator</h1>
        <p className="text-slate-400 text-sm">Scan the QR code with 1Password or any authenticator app</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        {/* QR Code */}
        {qrCode && (
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="QR Code" width={200} height={200} />
            </div>
          </div>
        )}

        {/* Manual entry secret */}
        {secret && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
              Or enter this key manually
            </p>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-slate-700 dark:text-slate-300 tracking-widest break-all">
                {secret}
              </code>
              <button onClick={copySecret} className="text-slate-400 hover:text-primary flex-shrink-0">
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Verification */}
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enter the 6-digit code to verify
            </label>
            <input
              {...form.register("code")}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000 000"
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm text-center tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition font-mono text-lg"
            />
            {form.formState.errors.code && (
              <p className="text-xs text-destructive text-center">{form.formState.errors.code.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Activate MFA
          </button>
        </form>
      </div>
    </div>
  )
}
