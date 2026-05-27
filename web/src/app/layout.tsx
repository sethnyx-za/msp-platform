import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers/Providers"
import { auth } from "@/auth"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: { default: "MSP Platform", template: "%s | MSP Platform" },
  description: "Managed IT Services Platform",
  robots: { index: false, follow: false }, // Private platform — no indexing
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  // Read user's theme preference from session to avoid flash
  const theme = session?.user?.theme ?? "system"
  const colorSwatch = session?.user?.colorSwatch

  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Apply theme class server-side to prevent flash
      className={theme === "dark" ? "dark" : theme === "light" ? "light" : ""}
      style={colorSwatch ? ({ "--primary": hexToHsl(colorSwatch) } as React.CSSProperties) : undefined}
    >
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  )
}

/** Convert hex color to HSL string for CSS variable override */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
