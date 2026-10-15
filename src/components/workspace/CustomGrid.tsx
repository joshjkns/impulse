import { LayoutGrid } from 'lucide-react'
import { useMemo } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { LogoPulse } from '@/components/brand/Logo'
import { WidgetFrame } from '@/components/widgets/WidgetFrame'
import { useElementHeight } from '@/lib/useElementHeight'
import { useChat } from '@/store/chat'
import { GRID_COLS, GRID_ROWS, useWorkspaces, type Tab } from '@/store/workspaces'

const GAP = 8

/** Free-form widget grid. Agent-built workspaces auto-tile until the user drags something. */
export function CustomGrid({ tab }: { tab: Extract<Tab, { kind: 'custom' }> }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const height = useElementHeight(containerRef)
  const setLayout = useWorkspaces((s) => s.setLayout)
  const building = useChat((s) =>
    s.threads.some((t) => t.id === tab.threadId && t.messages.some((m) => m.status === 'working')),
  )
  const rowHeight = Math.max(8, (height - GAP * (GRID_ROWS - 1)) / GRID_ROWS)
  const layout = useMemo(() => tab.layout.map((l) => ({ ...l, minW: 2, minH: 2 })), [tab.layout])

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto no-scrollbar">
      {!tab.widgets.length && (
        <div className="absolute inset-0 grid place-items-center rounded-[12px] bg-panel">
          <div className="flex flex-col items-center gap-3 text-[12.5px] text-fg-2">
            {building ? <LogoPulse className="size-8" /> : <LayoutGrid className="size-6 text-fg-3" />}
            {building ? 'Impulse is planning this workspace…' : 'Add a widget, or ask Impulse to build one.'}
          </div>
        </div>
      )}
      {mounted && height > 0 && tab.widgets.length > 0 && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLS, rowHeight, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: Infinity }}
          dragConfig={{ enabled: true, handle: '.drag-handle', bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onDragStop={(l: Layout) => setLayout(tab.id, l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))}
          onResizeStop={(l: Layout) => setLayout(tab.id, l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))}
        >
          {tab.widgets.map((w) => (
            <div key={w.id}>
              <WidgetFrame tabId={tab.id} widget={w} />
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  )
}
