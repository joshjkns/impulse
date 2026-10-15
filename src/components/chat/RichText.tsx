import { LayoutGrid } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { nav } from '@/lib/uiTools'
import { useUI } from '@/store/ui'
import { useWorkspaces } from '@/store/workspaces'

/**
 * Minimal markdown for chat replies: paragraphs, "-" bullets, **bold**, `code`, [links](url) and
 * [[workspace:id]] chips that jump to the workspace the agent built.
 */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-4 marker:text-fg-3">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i} className="break-words whitespace-pre-wrap">
            {inline(b.replace(/^#+\s*/gm, ''))}
          </p>
        )
      })}
    </div>
  )
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\[workspace:[\w-]+\]\]|\[[^\]]+\]\(https?:[^)]+\))/g

function inline(s: string): ReactNode[] {
  return s.split(TOKEN).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**')) return <strong key={i} className="font-semibold text-inherit">{part.slice(2, -2)}</strong>
    if (part.startsWith('`')) return <code key={i} className="rounded bg-black/25 px-1 text-[11.5px]">{part.slice(1, -1)}</code>
    if (part.startsWith('[[workspace:')) return <WorkspaceChip key={i} id={part.slice(12, -2)} />
    const link = /^\[([^\]]+)\]\((https?:[^)]+)\)$/.exec(part)
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="underline decoration-fg-3 underline-offset-2 hover:decoration-fg">
          {link[1]}
        </a>
      )
    return <Fragment key={i}>{part}</Fragment>
  })
}

function WorkspaceChip({ id }: { id: string }) {
  const tab = useWorkspaces((s) => s.tabs.find((t) => t.id === id))
  if (!tab || tab.kind !== 'custom') return <span className="text-fg-2">workspace</span>
  return (
    <button
      onClick={() => {
        useWorkspaces.getState().setActive(id)
        nav.go(`/workspaces/${id}`)
        if (useUI.getState().chatMode === 'modal') useUI.getState().setChatMode('docked')
      }}
      className="mx-0.5 inline-flex translate-y-[1px] items-center gap-1 rounded-[6px] bg-white/[0.07] px-1.5 py-[1px] align-baseline text-[11.5px] text-fg-2 transition-colors hover:bg-white/[0.12] hover:text-fg"
    >
      <LayoutGrid className="size-3" />
      {tab.title} ({tab.widgets.length})
    </button>
  )
}
