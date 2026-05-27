"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip"

interface Props {
  reportId: string
  onUploaded?: () => void
}

export default function CsvImport({ reportId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Only CSV files are supported")
      return
    }

    setLoading(true)
    try {
      const form = new FormData()
      form.append("file", file)

      const res = await fetch(`/api/admin/reports/${reportId}/source-files`, {
        method: "POST",
        body: form,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")

      const { rowCount, fileType } = json.data
      toast.success(`CSV imported — ${rowCount} rows (${fileType.replace("_", " ")})`)
      onUploaded?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Import CSV (Atera agents / tickets)</TooltipContent>
      </Tooltip>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </TooltipProvider>
  )
}
