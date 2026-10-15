import { Check, Copy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** Building blocks shared by every settings page, so each page is just a list of labelled rows. */

export function Page({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-[15px] font-medium text-fg">{title}</h2>
        {description && <p className="mt-1 text-[12px] leading-relaxed text-fg-2">{description}</p>}
      </header>
      {children}
    </div>
  )
}

export function Group({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {(title || aside) && (
        <div className="mb-1.5 flex items-center justify-between px-1">
          {title && <h3 className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">{title}</h3>}
          {aside}
        </div>
      )}
      <div className="divide-y divide-white/[0.05] rounded-[12px] bg-white/[0.025] ring-1 ring-white/[0.05]">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[48px] items-center gap-4 px-3.5 py-2.5', className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40',
        checked ? 'bg-brand' : 'bg-chip',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className={cn('absolute top-[2px] size-4 rounded-full bg-white shadow', checked ? 'right-[2px]' : 'left-[2px]')}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  id,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  /** Unique per control so the moving highlight doesn't jump between controls. */
  id: string
}) {
  return (
    <div className="flex rounded-[9px] bg-field p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button key={String(o.value)} onClick={() => onChange(o.value)} className="relative px-2.5 py-1 text-[12px]">
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[7px] bg-chip" transition={{ type: 'spring', stiffness: 700, damping: 45 }} />
          )}
          <span className={cn('relative', value === o.value ? 'text-fg' : 'text-fg-2')}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Text input that commits on blur / Enter, so stores aren't written on every keystroke. */
export function TextField({
  value,
  onCommit,
  placeholder,
  mono,
  className,
  sanitize = (s) => s,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  mono?: boolean
  className?: string
  sanitize?: (s: string) => string
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      onChange={(e) => (e.target.value = sanitize(e.target.value))}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={placeholder}
      className={cn(
        'h-8 w-full rounded-[8px] bg-field px-2.5 text-[12.5px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]',
        mono && 'num text-[12px]',
        className,
      )}
    />
  )
}

export function Stepper({ value, min, max, step = 1, suffix, onChange }: { value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  return (
    <div className="flex h-8 items-center rounded-[8px] bg-field ring-1 ring-line">
      <button onClick={() => onChange(clamp(value - step))} disabled={value <= min} className="h-full w-7 text-fg-2 hover:text-fg disabled:opacity-30">
        −
      </button>
      <span className="num min-w-[44px] text-center text-[12.5px] text-fg">
        {value}
        {suffix}
      </span>
      <button onClick={() => onChange(clamp(value + step))} disabled={value >= max} className="h-full w-7 text-fg-2 hover:text-fg disabled:opacity-30">
        +
      </button>
    </div>
  )
}

export function Button({ tone = 'default', className, ...p }: React.ComponentProps<'button'> & { tone?: 'default' | 'primary' | 'danger' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[12px] whitespace-nowrap transition-colors duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        tone === 'primary' && 'bg-fg font-medium text-[#111113] hover:opacity-90',
        tone === 'default' && 'bg-chip text-fg hover:bg-[#35353a]',
        tone === 'danger' && 'bg-down-soft/60 text-[#ff9aa9] hover:bg-down-soft',
        className,
      )}
    />
  )
}

/** A destructive button that asks for a second click before running. */
export function DangerButton({ onConfirm, children, confirmLabel = 'Click again to confirm' }: { onConfirm: () => void; children: ReactNode; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button tone="danger" onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : children}
    </Button>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        toast.success('Copied')
        setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex items-center gap-1 text-[11.5px] text-fg-2 hover:text-fg"
      aria-label={label ?? 'Copy'}
    >
      {done ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
      {label}
    </button>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[10px] px-3 py-2 text-[12px] leading-relaxed',
        tone === 'warn' ? 'bg-down-soft/50 text-[#ff9aa9]' : 'bg-brand-soft/60 text-[#8fbcff]',
      )}
    >
      {children}
    </div>
  )
}
