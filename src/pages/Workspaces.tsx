import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { DockedChat } from '@/components/chat/ChatHost'
import { CustomGrid } from '@/components/workspace/CustomGrid'
import { TabBar } from '@/components/workspace/TabBar'
import { TradeLayout } from '@/components/workspace/TradeLayout'
import { useUI } from '@/store/ui'
import { useWorkspaces } from '@/store/workspaces'

export default function Workspaces() {
  const { id } = useParams()
  const nav = useNavigate()
  const { tabs, active, setActive } = useWorkspaces()
  const chatMode = useUI((s) => s.chatMode)

  // URL is the source of truth when present; otherwise reflect the active tab in the URL.
  useEffect(() => {
    if (id && id !== active && tabs.some((t) => t.id === id)) setActive(id)
    else if (!id && active) nav(`/workspaces/${active}`, { replace: true })
  }, [id, active, tabs, setActive, nav])

  const tab = tabs.find((t) => t.id === (id ?? active)) ?? tabs.find((t) => t.id === active)

  return (
    <div className="flex h-full flex-col px-2 pb-1">
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {tab ? (
              <motion.div
                key={tab.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0"
              >
                {tab.kind === 'market' ? <TradeLayout tab={tab} /> : <CustomGrid tab={tab} />}
              </motion.div>
            ) : (
              <div className="grid h-full place-items-center text-[13px] text-fg-2">Open a market with + or ask Impulse to build a workspace.</div>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>{chatMode === 'docked' && <DockedChat key="dock" />}</AnimatePresence>
      </div>
    </div>
  )
}
