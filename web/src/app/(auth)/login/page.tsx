"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Shield, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

// ─── Schemas ──────────────────────────────────────────────────────────────────

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

const mfaSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Digits only"),
})

type CredentialsForm = z.infer<typeof credentialsSchema>
type MfaForm = z.infer<typeof mfaSchema>
type Step = "credentials" | "mfa"

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"

  const [step, setStep] = useState<Step>("credentials")
  const [pendingKey, setPendingKey] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const credForm = useForm<CredentialsForm>({ resolver: zodResolver(credentialsSchema) })
  const mfaForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) })

  // ── Step 1: email + password ───────────────────────────────────────────────
  async function handleCredentials(data: CredentialsForm) {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(`Too many attempts. Try again in ${Math.ceil(json.retryAfterSeconds / 60)} minutes.`)
        } else {
          toast.error(json.error ?? "Login failed")
        }
        return
      }

      if (json.requiresMfa) {
        setPendingKey(json.pendingKey)
        setStep("mfa")
        return
      }

      // No MFA — complete sign-in immediately
      await completeSignIn(json.bypassKey)
    } catch {
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: TOTP code ──────────────────────────────────────────────────────
  async function handleMfa(data: MfaForm) {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/verify-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingKey, code: data.code }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Invalid code")
        mfaForm.reset()
        return
      }

      await completeSignIn(json.bypassKey)
    } catch {
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function completeSignIn(bypassKey: string) {
    const result = await signIn("credentials", {
      mfaBypassKey: bypassKey,
      redirect: false,
    })

    if (result?.error) {
      toast.error("Sign-in failed. Please try again.")
      setStep("credentials")
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Logo / Branding */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-white">MSP Platform</h1>
        <p className="text-slate-400 text-sm">
          {step === "credentials" ? "Sign in to your account" : "Two-factor authentication"}
        </p>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">

        {step === "credentials" ? (
          <form onSubmit={credForm.handleSubmit(handleCredentials)} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Email address
              </label>
              <input
                {...credForm.register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
              />
              {credForm.formState.errors.email && (
                <p className="text-xs text-destructive">{credForm.formState.errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  {...credForm.register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {credForm.formState.errors.password && (
                <p className="text-xs text-destructive">{credForm.formState.errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={mfaForm.handleSubmit(handleMfa)} className="space-y-4">
            <div className="text-center space-y-1">
              <div className="text-3xl">🔐</div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Open your authenticator app and enter the 6-digit code
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Authentication code
              </label>
              <input
                {...mfaForm.register("code")}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000 000"
                maxLength={6}
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm text-center tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition font-mono text-lg"
              />
              {mfaForm.formState.errors.code && (
                <p className="text-xs text-destructive text-center">{mfaForm.formState.errors.code.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 rounded-lg text-sm transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify
            </button>

            <button
              type="button"
              onClick={() => { setStep("credentials"); setPendingKey("") }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
            >
              ← Back to login
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Secure MSP management platform
      </p>
    </div>
  )
}
