"use client"

import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { FileBarChart2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Report {
  id: string
  title: string
  periodStart: string
  periodEnd: string
  pdfPath: string | null
  publishedAt: string | null
  generatedAt: string | null
}

export default function ClientReportsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["client-reports"],
    queryFn: async () => {
      const res = await fetch("/api/reports")
      if (!res.ok) throw new Error("Failed to load reports")
      return res.json() as Promise<{ data: Report[] }>
    },
    staleTime: 60_000,
  })

  const reports = data?.data ?? []

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileBarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No reports available</p>
        <p className="text-sm mt-1">Your MSP will publish reports here when they are ready.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-4 border rounded-lg px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileBarChart2 className="h-5 w-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Period: {r.periodStart} – {r.periodEnd}
              {r.publishedAt && (
                <span className="ml-3">
                  Published {format(new Date(r.publishedAt), "dd MMM yyyy")}
                </span>
              )}
            </p>
          </div>

          <Badge variant="outline" className="shrink-0">Published</Badge>

          {r.pdfPath && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => window.open(`/api/reports/${r.id}/download`, "_blank")}
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
