"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { Pencil, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import AssetDialog, { type AssetItem } from "./AssetDialog"

interface Props {
  asset: AssetItem
}

export default function AssetActions({ asset }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [retireOpen, setRetireOpen] = useState(false)

  const retireMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/assets/${asset.id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Asset retired")
      router.refresh()
      setRetireOpen(false)
    },
    onError: () => toast.error("Failed to retire asset"),
  })

  const canRetire = asset.status !== "retired" && asset.status !== "disposed"

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
        {canRetire && (
          <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setRetireOpen(true)}>
            <Archive className="h-4 w-4 mr-2" />
            Retire
          </Button>
        )}
      </div>

      <AssetDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); router.refresh() }}
        asset={asset}
      />

      <AlertDialog open={retireOpen} onOpenChange={setRetireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire asset?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{asset.name}</strong> will be marked as retired. It remains in the registry
              for historical reference but is flagged as no longer in service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => retireMutation.mutate()}
              disabled={retireMutation.isPending}
            >
              {retireMutation.isPending ? "Retiring..." : "Retire Asset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
