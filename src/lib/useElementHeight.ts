import { useEffect, useState, type RefObject } from 'react'

export function useElementHeight(ref: RefObject<HTMLElement | null>) {
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height))
    ro.observe(el)
    setH(el.clientHeight)
    return () => ro.disconnect()
  }, [ref])
  return h
}
