const KEY = 'expressive-captions:recent-projects'
const MAX = 8

export interface RecentProject {
  projectId: string
  filename: string
  openedAt: number
}

/**
 * Recently opened projects, for the no-project screen. These ids can outlive the projects
 * they name (the dev table is shared and gets cleaned), so every consumer must tolerate a
 * 404 on one rather than assuming it resolves — plan §8.12.
 */
export function readRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is RecentProject =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentProject).projectId === 'string' &&
        typeof (entry as RecentProject).filename === 'string',
    )
  } catch {
    return [] // private mode, blocked storage, corrupted value — none are worth an error
  }
}

export function rememberProject(projectId: string, filename: string): void {
  try {
    const existing = readRecentProjects().filter((entry) => entry.projectId !== projectId)
    const next: RecentProject[] = [{ projectId, filename, openedAt: Date.now() }, ...existing].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage being unavailable must never break the upload flow.
  }
}
