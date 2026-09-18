import { Button } from '@/components/ui/button'

interface EditorMessageProps {
  title: string
  detail?: string
  actionLabel?: string
  onAction?: () => void
  error?: string | null
}

/** Centred full-pane state: loading, not-ready, not-found, unreachable. No spinner-only screens. */
export function EditorMessage({ title, detail, actionLabel, onAction, error }: EditorMessageProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <h1 className="text-lg font-semibold">{title}</h1>
      {detail && <p className="max-w-md text-sm text-muted-foreground">{detail}</p>}
      {actionLabel && onAction && (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
