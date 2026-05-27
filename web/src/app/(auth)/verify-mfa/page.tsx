// MFA verification is handled inline within the login page (/login).
// This route exists as a fallback redirect only.
import { redirect } from "next/navigation"
export default function VerifyMfaPage() {
  redirect("/login")
}
