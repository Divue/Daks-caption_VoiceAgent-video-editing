interface PanelPlaceholderProps {
  title: string
  description: string
}

/** Stands in for a panel not built yet; swapped out step by step. */
export function PanelPlaceholder({ title, description }: PanelPlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
