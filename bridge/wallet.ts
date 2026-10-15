/**
 * Browser-wallet relay for the desktop app.
 *
 * Electron can't run wallet extensions (Phantom, MetaMask, Rabby, …), so the app opens a small pairing page
 * (`wallet.html`) in the user's real browser. Both sides connect to this bridge with the same random token;
 * EIP-1193 requests from the app are forwarded to the page, which runs them against the extension, and the
 * results and wallet events come back the same way.
 *
 *   app ──wallet_req──▶ bridge ──▶ wallet page ──provider.request──▶ extension
 *   app ◀─wallet_res / wallet_event / wallet_status── bridge ◀── wallet page
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import type { WebSocket } from 'ws'

type Msg = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface PageState {
  ws: WebSocket
  accounts: string[]
  chainId?: number
  name?: string
  icon?: string
}

const pages = new Map<string, PageState>()
const apps = new Map<string, Set<WebSocket>>()
/** Which app socket asked, so the answer goes back to the window that's waiting for it. */
const pending = new Map<string, WebSocket>()

const send = (ws: WebSocket, msg: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
const toApps = (token: string, msg: unknown) => apps.get(token)?.forEach((ws) => send(ws, msg))

function status(token: string) {
  const p = pages.get(token)
  return { type: 'wallet_status', token, page: !!p, accounts: p?.accounts ?? [], chainId: p?.chainId, name: p?.name, icon: p?.icon }
}

/** Returns true when the message was a wallet-relay message (and has been handled). */
export function handleWalletMessage(ws: WebSocket, msg: Msg): boolean {
  const token = typeof msg.token === 'string' ? msg.token : ''
  if (!String(msg.type ?? '').startsWith('wallet_') || token.length < 16) return false
  switch (msg.type) {
    // App side
    case 'wallet_link': {
      const set = apps.get(token) ?? new Set()
      set.add(ws)
      apps.set(token, set)
      ws.once('close', () => set.delete(ws))
      send(ws, status(token))
      break
    }
    case 'wallet_req': {
      const page = pages.get(token)
      if (!page) {
        send(ws, { type: 'wallet_res', token, id: msg.id, error: { code: 4900, message: 'The browser wallet page is closed. Connect again to reopen it.' } })
        break
      }
      pending.set(String(msg.id), ws)
      send(page.ws, { type: 'wallet_req', id: msg.id, method: msg.method, params: msg.params })
      break
    }
    case 'wallet_unlink':
      if (pages.has(token)) send(pages.get(token)!.ws, { type: 'wallet_disconnect' })
      break

    // Page side
    case 'wallet_page': {
      const prev = pages.get(token)
      if (prev && prev.ws !== ws) send(prev.ws, { type: 'wallet_replaced' })
      pages.set(token, { ws, accounts: [] })
      ws.once('close', () => {
        if (pages.get(token)?.ws !== ws) return
        pages.delete(token)
        toApps(token, status(token))
      })
      toApps(token, status(token))
      break
    }
    case 'wallet_connected': {
      const p = pages.get(token)
      if (!p || p.ws !== ws) break
      Object.assign(p, { accounts: msg.accounts ?? [], chainId: Number(msg.chainId) || undefined, name: msg.name, icon: msg.icon })
      toApps(token, status(token))
      break
    }
    case 'wallet_res': {
      const app = pending.get(String(msg.id))
      pending.delete(String(msg.id))
      if (app) send(app, { type: 'wallet_res', token, id: msg.id, result: msg.result, error: msg.error })
      break
    }
    case 'wallet_event': {
      const p = pages.get(token)
      if (p && p.ws === ws) {
        if (msg.event === 'accountsChanged') p.accounts = msg.data ?? []
        if (msg.event === 'chainChanged') p.chainId = Number(msg.data) || p.chainId
        if (msg.event === 'disconnect') p.accounts = []
      }
      toApps(token, { type: 'wallet_event', token, event: msg.event, data: msg.data })
      break
    }
  }
  return true
}

/** Whether a socket belongs to a wallet page (those don't count as open Impulse windows). */
export const isWalletPage = (ws: WebSocket) => [...pages.values()].some((p) => p.ws === ws)

/* ------------------------------------------------------------------ static wallet page (packaged app) */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

/**
 * In the packaged app the pairing page is served from the Vite build (`IMPULSE_STATIC`), since the browser
 * can't open the app's own `impulse://` scheme. Only the page and its assets are exposed.
 */
export function serveWalletPage(url: string, res: ServerResponse): boolean {
  const root = process.env.IMPULSE_STATIC
  if (!root) return false
  const pathname = decodeURIComponent(new URL(url, 'http://x').pathname)
  if (pathname !== '/wallet.html' && !pathname.startsWith('/assets/') && pathname !== '/favicon.svg') return false
  const file = path.join(root, path.normalize(pathname))
  if (!file.startsWith(path.resolve(root)) || !existsSync(file) || statSync(file).isDirectory()) return false
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(file))
  return true
}
