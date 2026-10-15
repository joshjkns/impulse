import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router'
import { useAccount as useWagmiAccount } from 'wagmi'
import { ChatHost, useToggleChat } from '@/components/chat/ChatHost'
import { CommandMenu } from '@/components/shell/CommandMenu'
import { Footer } from '@/components/shell/Footer'
import { Notifications } from '@/components/shell/Notifications'
import { PortfolioPanel } from '@/components/shell/PortfolioPanel'
import { SettingsDialog } from '@/components/shell/SettingsDialog'
import { Splash } from '@/components/shell/Splash'
import { TopBar } from '@/components/shell/TopBar'
import { Toaster } from '@/components/ui/sonner'
import { useBridge } from '@/lib/bridge'
import { nav } from '@/lib/uiTools'
import Feed from '@/pages/Feed'
import Home from '@/pages/Home'
import Workspaces from '@/pages/Workspaces'
import { useAccount } from '@/store/account'
import { useMarkets } from '@/store/markets'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'

export default function App() {
  const start = useMarkets((s) => s.start)
  const { address } = useWagmiAccount()
  const setAddress = useAccount((s) => s.setAddress)
  const openCommand = useUI((s) => s.openCommand)
  const watching = useUI((s) => s.watching)
  const reduceMotion = usePrefs((s) => s.reduceMotion)
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  useEffect(() => void start(), [start])
  useEffect(() => setAddress(watching ?? address, !!watching), [address, watching, setAddress])
  useBridge()
  const navigate = useNavigate()
  useEffect(() => {
    nav.go = (p) => navigate(p)
  }, [navigate])

  const toggleChat = useToggleChat()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        return toggleChat()
      }
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,[contenteditable]')) return
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        openCommand()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommand, toggleChat])

  const section = pathname.split('/')[1] || 'home'

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <div className="flex h-full bg-canvas">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="relative min-h-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={section}
                initial={{ opacity: 0, scale: 0.995 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.2, 0.9, 0.1, 1] }}
                className="absolute inset-0"
              >
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/workspaces/:id?" element={<Workspaces />} />
                  <Route path="/feed" element={<Feed />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>
          <Footer />
        </div>
        {isHome && <PortfolioPanel />}
        <ChatHost />
        <CommandMenu />
        <SettingsDialog />
        <Notifications />
        <Toaster />
        <Splash />
      </div>
    </MotionConfig>
  )
}
