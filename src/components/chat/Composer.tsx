import { ArrowUp, Plus, Settings2, SquarePen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { useUI } from '@/store/ui'
import { ModelPicker } from './ModelPicker'

export function Composer({ busy, compact, autoFocus }: { busy: boolean; compact?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const send = useChat((s) => s.send)
  const cancel = useChat((s) => s.cancel)
  const queued = useChat((s) => s.queue.filter((q) => q.threadId === s.activeThread).length)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  // Grow with content up to ~5 lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const submit = () => {
    if (!text.trim()) return
    void send(text)
    setText('')
  }

  const hasText = text.trim().length > 0
  const showStop = busy && !hasText

  return (
    <div className={cn(compact ? 'px-2.5 pt-1 pb-2.5' : 'px-3 pt-2 pb-3')}>
      <div
        // The whole box is the text field's hit area, not just the line of text.
        onMouseDown={(e) => {
          if (e.target === ref.current || (e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          ref.current?.focus()
        }}
        className="cursor-text rounded-[16px] bg-field ring-1 ring-[#2c2c33] transition-shadow focus-within:ring-[#3a3a44]"
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && busy) cancel()
          }}
          placeholder={busy ? 'Enter queues it for after this reply' : 'Message Impulse'}
          className="block max-h-[120px] min-h-[34px] w-full resize-none bg-transparent px-3 pt-[9px] pb-1 text-[12.5px] leading-[18px] text-fg outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <PlusMenu />
          <ModelPicker compact={compact} />
          <span className="flex-1" />
          {queued > 0 && <span className="num px-1 text-[11px] text-fg-3" title="Queued messages">+{queued}</span>}
          <AnimatePresence mode="popLayout" initial={false}>
            {showStop ? (
              <motion.button
                key="stop"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={() => cancel()}
                className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-[#111113] active:scale-90"
                aria-label="Stop"
              >
                <span className="size-2 rounded-[2px] bg-[#111113]" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={submit}
                disabled={!hasText}
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150 active:scale-90',
                  hasText ? 'bg-brand text-white' : 'bg-[#33333a] text-fg-2',
                )}
                aria-label="Send"
              >
                <ArrowUp className="size-3.5" strokeWidth={2.5} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function PlusMenu() {
  const newThread = useChat((s) => s.newThread)
  const openSettings = useUI((s) => s.openSettings)
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="grid size-6 shrink-0 place-items-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover" aria-label="More">
          <Plus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 gap-0 rounded-xl border-line bg-popover p-1.5">
        <button
          onClick={() => (newThread(), setOpen(false))}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fg hover:bg-hover"
        >
          <SquarePen className="size-3.5 text-fg-2" /> New chat
        </button>
        <button
          onClick={() => (openSettings(true, 'agent'), setOpen(false))}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fg hover:bg-hover"
        >
          <Settings2 className="size-3.5 text-fg-2" /> Agent settings
        </button>
      </PopoverContent>
    </Popover>
  )
}
