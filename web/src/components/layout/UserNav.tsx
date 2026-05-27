"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import type { SessionUser } from "@/types"
import { getInitials } from "@/lib/utils"
import { useTheme } from "next-themes"
import { useState } from "react"
import {
  User, LogOut, Shield, Sun, Moon, Monitor,
  ChevronDown, Settings,
} from "lucide-react"

interface UserNavProps {
  user: SessionUser
}

export function UserNav({ user }: UserNavProps) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  const themeOptions = [
    { value: "light",  label: "Light",  icon: <Sun className="w-3.5 h-3.5" /> },
    { value: "dark",   label: "Dark",   icon: <Moon className="w-3.5 h-3.5" /> },
    { value: "system", label: "System", icon: <Monitor className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          {getInitials(user.name)}
        </div>

        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground leading-tight capitalize">
            {user.role.replace(/_/g, " ")}
          </p>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 z-20 bg-popover border border-border rounded-xl shadow-lg py-1 overflow-hidden">
            {/* User info */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {user.isMspStaff && (
                <div className="flex items-center gap-1 mt-1">
                  <Shield className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-primary font-medium">MSP Staff</span>
                </div>
              )}
            </div>

            {/* Theme selector */}
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Theme
              </p>
              <div className="flex gap-1">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md text-xs transition ${
                      theme === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    {opt.icon}
                    <span className="text-[10px]">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="py-1">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition"
              >
                <User className="w-4 h-4 text-muted-foreground" />
                Profile & Security
              </Link>

              {user.isMspStaff && (
                <Link
                  href="/admin/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition"
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Platform Settings
                </Link>
              )}

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition text-left text-destructive hover:text-destructive"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
