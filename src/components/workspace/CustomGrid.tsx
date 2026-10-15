import { LayoutGrid } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ReactGridLayout, {
  getCompactor,
  moveElement,
  useContainerWidth,
  verticalCompactor,
  type Compactor,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
} from 'react-grid-layout'
import { GridBackground } from 'react-grid-layout/extras'
import { LogoPulse } from '@/components/brand/Logo'
import { WidgetFrame } from '@/components/widgets/WidgetFrame'
import { useElementHeight } from '@/lib/useElementHeight'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { GRID_COLS, GRID_ROWS, minSize, useWorkspaces, type GridItem, type Tab } from '@/store/workspaces'

const GAP = 8
const HANDLES: ResizeHandleAxis[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

/** While dragging, nothing else moves: the drop decides between a swap and a push (see `resolveDrop`). */
const DRAG_COMPACTOR = getCompactor('vertical', true)

type Item = LayoutItem
const strip = (l: Layout): GridItem[] => l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
const overlaps = (a: Item, b: Item) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The widget under the centre of the dragged one, if any — dropping there swaps the two. */
function swapTarget(base: readonly Item[], moved: Item) {
  const cx = moved.x + moved.w / 2
  const cy = moved.y + moved.h / 2
  return base.find((b) => b.i !== moved.i && cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h)
}

/**
 * Drop onto another widget → the two trade places and sizes, so a tiled screen stays tiled.
 * Drop onto open space → it lands there and anything it overlaps is pushed down, then the grid compacts.
 */
function resolveDrop(base: readonly Item[], moved: Item): Layout {
  const items = base.map((b) => ({ ...b }))
  const self = items.find((b) => b.i === moved.i)
  if (!self) return items
  const target = swapTarget(base, moved)
  if (target) {
    const other = items.find((b) => b.i === target.i)!
    const a = { x: self.x, y: self.y, w: self.w, h: self.h }
    Object.assign(self, { x: other.x, y: other.y, w: other.w, h: other.h })
    Object.assign(other, a)
    return verticalCompactor.compact(items, GRID_COLS)
  }
  return verticalCompactor.compact(moveElement(items, self, moved.x, moved.y, true, false, 'vertical', GRID_COLS, false), GRID_COLS)
}

/* ------------------------------------------------------------------ split-pane resizing */

interface Axis {
  pos: 'x' | 'y'
  size: 'w' | 'h'
  min: 'minW' | 'minH'
  cross: { pos: 'x' | 'y'; size: 'w' | 'h' }
}
const X: Axis = { pos: 'x', size: 'w', min: 'minW', cross: { pos: 'y', size: 'h' } }
const Y: Axis = { pos: 'y', size: 'h', min: 'minH', cross: { pos: 'x', size: 'w' } }

/** Each edge a handle moves: its axis, and whether it's the far (right/bottom) edge. */
const edgesOf = (handle: ResizeHandleAxis) =>
  [
    handle.includes('e') && { ax: X, far: true },
    handle.includes('w') && { ax: X, far: false },
    handle.includes('s') && { ax: Y, far: true },
    handle.includes('n') && { ax: Y, far: false },
  ].filter((e): e is { ax: Axis; far: boolean } => !!e)

/** Widgets whose edge touches `old`'s moving edge and that share some of its span. */
function touching(base: readonly Item[], old: Item, ax: Axis, far: boolean) {
  const { pos, size } = ax.cross
  const edge = far ? old[ax.pos] + old[ax.size] : old[ax.pos]
  return base.filter(
    (n) =>
      n.i !== old.i &&
      n[pos] < old[pos] + old[size] &&
      old[pos] < n[pos] + n[size] &&
      (far ? n[ax.pos] === edge : n[ax.pos] + n[ax.size] === edge),
  )
}

/** How far a handle may grow its widget before a touching neighbour hits its minimum size. */
function resizeLimits(base: readonly Item[], id: string, handle: ResizeHandleAxis) {
  const old = base.find((b) => b.i === id)
  const out: { maxW?: number; maxH?: number } = {}
  if (!old) return out
  for (const { ax, far } of edgesOf(handle)) {
    const ns = touching(base, old, ax, far)
    if (!ns.length) continue
    const room = Math.min(...ns.map((n) => n[ax.size] - (n[ax.min] ?? 1)))
    out[ax === X ? 'maxW' : 'maxH'] = old[ax.size] + Math.max(0, room)
  }
  return out
}

/** Move the shared edge: neighbours that touched the resized widget follow it, growing or shrinking. */
function tileResize(base: readonly Item[], resized: Item, handle: ResizeHandleAxis): Layout {
  const old = base.find((b) => b.i === resized.i)
  const out = base.map((b) => (b.i === resized.i ? { ...b, x: resized.x, y: resized.y, w: resized.w, h: resized.h } : { ...b }))
  const me = out.find((b) => b.i === resized.i)
  if (!old || !me) return verticalCompactor.compact(out, GRID_COLS)
  for (const { ax, far } of edgesOf(handle)) {
    const ids = new Set(touching(base, old, ax, far).map((n) => n.i))
    for (const n of out) {
      if (!ids.has(n.i)) continue
      const prev = { ...n }
      if (far) {
        const end = n[ax.pos] + n[ax.size]
        n[ax.pos] = me[ax.pos] + me[ax.size]
        n[ax.size] = end - n[ax.pos]
      } else {
        n[ax.size] = me[ax.pos] - n[ax.pos]
      }
      // A neighbour that would run into a third widget (or under its minimum) stays put; compaction sorts it out.
      if (n[ax.size] < (n[ax.min] ?? 1) || out.some((o) => o !== n && o !== me && overlaps(o, n))) Object.assign(n, prev)
    }
  }
  return verticalCompactor.compact(out, GRID_COLS)
}

/* ------------------------------------------------------------------ grid */

type Press = { kind: 'drag' } | { kind: 'resize'; id: string; handle: ResizeHandleAxis } | null

/** Free-form widget grid. Agent-built workspaces auto-tile until the user drags or resizes something. */
export function CustomGrid({ tab }: { tab: Extract<Tab, { kind: 'custom' }> }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const height = useElementHeight(containerRef)
  const setLayout = useWorkspaces((s) => s.setLayout)
  const building = useChat((s) =>
    s.threads.some((t) => t.id === tab.threadId && t.messages.some((m) => m.status === 'working')),
  )
  /** Set while the user is moving something — shows the snap grid and freezes widget bodies. */
  const [mode, setMode] = useState<'drag' | 'resize' | null>(null)
  /** Set on pointer-down, before the library's drag/resize starts, so its first move already has the right rules. */
  const [press, setPress] = useState<Press>(null)
  const [target, setTarget] = useState<string>()
  const rowHeight = Math.max(8, (height - GAP * (GRID_ROWS - 1)) / GRID_ROWS)
  const kinds = useMemo(() => new Map(tab.widgets.map((w) => [w.id, w.kind])), [tab.widgets])
  const base = useMemo(() => tab.layout.map((l) => ({ ...l, ...minSize(kinds.get(l.i) ?? 'note') })), [tab.layout, kinds])
  const layout = useMemo(
    () => (press?.kind === 'resize' ? base.map((l) => (l.i === press.id ? { ...l, ...resizeLimits(base, press.id, press.handle) } : l)) : base),
    [base, press],
  )
  const rows = Math.max(GRID_ROWS, ...tab.layout.map((l) => l.y + l.h))

  // The library runs the compactor on every resize tick; it reads the pre-resize layout through a ref.
  const resizeRef = useRef<{ base: Item[]; id: string; handle: ResizeHandleAxis } | null>(null)
  const resizeCompactor = useMemo<Compactor>(
    () => ({
      type: 'vertical',
      allowOverlap: true,
      compact(l) {
        const r = resizeRef.current
        const resized = r && l.find((x) => x.i === r.id)
        if (!r || !resized) return verticalCompactor.compact(l, GRID_COLS)
        // Keep the live size limits the library put on the incoming items (see `resizeLimits`).
        const limits = new Map(l.map((x) => [x.i, { maxW: x.maxW, maxH: x.maxH }]))
        return tileResize(r.base, resized, r.handle).map((x) => ({ ...x, ...limits.get(x.i) }))
      },
    }),
    [],
  )
  const kind = mode ?? press?.kind
  const compactor = kind === 'drag' ? DRAG_COMPACTOR : kind === 'resize' ? resizeCompactor : verticalCompactor

  const commit = (l: Layout) => {
    setMode(null)
    setPress(null)
    setTarget(undefined)
    resizeRef.current = null
    const next = strip(l)
    // A click on the header is a zero-distance drag; don't let it pin an auto-tiled layout.
    if (JSON.stringify(next) !== JSON.stringify(strip(base))) setLayout(tab.id, next)
  }

  const onPointerDownCapture = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    const handle = t.closest<HTMLElement>('.grid-handle')
    const id = t.closest<HTMLElement>('[data-widget-id]')?.dataset.widgetId
    if (handle && id) {
      const axis = handle.dataset.axis as ResizeHandleAxis
      resizeRef.current = { base, id, handle: axis }
      setPress({ kind: 'resize', id, handle: axis })
    } else if (t.closest('.drag-handle') && !t.closest('.no-drag')) setPress({ kind: 'drag' })
    else return
    // A press that never becomes a drag (a plain click) still has to clear; after the library's own mouseup.
    window.addEventListener('pointerup', () => setTimeout(() => setPress(null)), { once: true })
  }

  return (
    <div
      ref={containerRef}
      className={cn('custom-grid relative h-full overflow-y-auto no-scrollbar', mode && `is-${mode}`, target && 'has-swap')}
      onPointerDownCapture={onPointerDownCapture}
    >
      {!tab.widgets.length && (
        <div className="absolute inset-0 grid place-items-center rounded-[12px] bg-panel">
          <div className="flex flex-col items-center gap-3 text-[12.5px] text-fg-2">
            {building ? <LogoPulse className="size-8" /> : <LayoutGrid className="size-6 text-fg-3" />}
            {building ? 'Impulse is planning this workspace…' : 'Add a widget, or ask Impulse to build one.'}
          </div>
        </div>
      )}
      {mounted && height > 0 && tab.widgets.length > 0 && (
        <>
          <GridBackground
            width={width}
            cols={GRID_COLS}
            rowHeight={rowHeight}
            margin={[GAP, GAP]}
            containerPadding={[0, 0]}
            rows={rows + 2}
            color="rgba(255,255,255,0.025)"
            borderRadius={4}
            className={cn('pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-150', mode ? 'opacity-100' : 'opacity-0')}
          />
          <ReactGridLayout
            width={width}
            layout={layout}
            compactor={compactor}
            gridConfig={{ cols: GRID_COLS, rowHeight, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: Infinity }}
            dragConfig={{ enabled: true, handle: '.drag-handle', cancel: '.no-drag', bounded: false, threshold: 4 }}
            resizeConfig={{
              enabled: true,
              handles: HANDLES,
              handleComponent: (axis: ResizeHandleAxis, ref: React.Ref<HTMLElement>) => (
                <span ref={ref as React.Ref<HTMLSpanElement>} data-axis={axis} className={`grid-handle grid-handle-${axis}`} />
              ),
            }}
            onDragStart={() => setMode('drag')}
            onDrag={(_l, _old, item) => item && setTarget(swapTarget(base, item)?.i)}
            onDragStop={(l, _old, item) => commit(item ? resolveDrop(base, item) : l)}
            onResizeStart={() => setMode('resize')}
            onResizeStop={commit}
          >
            {tab.widgets.map((w) => (
              <div key={w.id} data-widget-id={w.id} className={cn(target === w.id && 'swap-target')}>
                <WidgetFrame tabId={tab.id} widget={w} />
              </div>
            ))}
          </ReactGridLayout>
        </>
      )}
    </div>
  )
}
