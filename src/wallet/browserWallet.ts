/**
 * "Browser wallet" for the desktop app: Phantom, MetaMask, Rabby and other extensions live in the user's real
 * browser, which Electron can't load. Connecting opens a pairing page there (`wallet.html`); every EIP-1193
 * request is relayed to it through the local bridge (see bridge/wallet.ts), so wagmi, viem and the Hyperliquid
 * SDK work unchanged — approvals and signatures just pop up in the browser.
 */
import type { Wallet } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import { getAddress, numberToHex, type Address, type EIP1193RequestFn } from 'viem'
import { createConnector } from 'wagmi'
import { BRIDGE_WS, bridgeSend, onBridgeMessage, onBridgeOpen } from '@/lib/bridge'

type Status = { page: boolean; accounts: string[]; chainId?: number; name?: string }
type Res = { id: string; result?: unknown; error?: { code?: number; message?: string } }

const TOKEN_KEY = 'impulse.browserWallet.token'
const CONNECT_TIMEOUT = 5 * 60_000
const REQUEST_TIMEOUT = 5 * 60_000
/** Requests that make the user act in their wallet; the app points them at the browser for these. */
const INTERACTIVE = /^(eth_requestAccounts|eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*|wallet_(switch|add)EthereumChain)$/

let status: Status = { page: false, accounts: [] }
let statusSeen = false
const statusWaiters = new Set<(s: Status) => void>()
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const events = new Set<(event: string, data: unknown) => void>()

function token() {
  let t = localStorage.getItem(TOKEN_KEY)
  if (!t) {
    t = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(TOKEN_KEY, t)
  }
  return t
}

let wired = false
function wire() {
  if (wired) return
  wired = true
  onBridgeOpen(() => bridgeSend({ type: 'wallet_link', token: token() }))
  onBridgeMessage((msg) => {
    if (msg.token !== token()) return
    if (msg.type === 'wallet_status') {
      const prev = status
      status = { page: !!msg.page, accounts: msg.accounts ?? [], chainId: msg.chainId, name: msg.name }
      statusSeen = true
      statusWaiters.forEach((fn) => fn(status))
      if (prev.accounts.length && !status.accounts.length) events.forEach((fn) => fn('disconnect', undefined))
    } else if (msg.type === 'wallet_res') {
      const r = msg as unknown as Res
      const p = pending.get(String(r.id))
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(String(r.id))
      if (r.error) p.reject(Object.assign(new Error(r.error.message ?? 'Wallet request failed'), { code: r.error.code }))
      else p.resolve(r.result)
    } else if (msg.type === 'wallet_event') events.forEach((fn) => fn(String(msg.event), msg.data))
  })
}

function waitForStatus(pred: (s: Status) => boolean, ms: number) {
  return new Promise<Status>((resolve, reject) => {
    if (statusSeen && pred(status)) return resolve(status)
    const done = (s: Status) => {
      if (!pred(s)) return
      clearTimeout(timer)
      statusWaiters.delete(done)
      resolve(s)
    }
    const timer = setTimeout(() => {
      statusWaiters.delete(done)
      reject(new Error('Timed out waiting for the browser wallet'))
    }, ms)
    statusWaiters.add(done)
  })
}

/** Where the pairing page lives: the dev server in dev, the bridge in the packaged app. */
function pageUrl() {
  const base = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : BRIDGE_WS.replace(/^ws/, 'http').replace(/\/ws$/, '')
  return `${base}/wallet.html#${token()}`
}

const request: EIP1193RequestFn = async ({ method, params }) => {
  if (method === 'eth_accounts') return status.accounts as never
  if (method === 'eth_chainId') return numberToHex(status.chainId ?? 1) as never
  const id = crypto.randomUUID()
  const interactive = INTERACTIVE.test(method)
  if (interactive) toast.loading('Confirm in your browser', { id: `bw-${id}`, description: `${status.name ?? 'Your wallet'} is waiting for you in the browser tab Impulse opened.` })
  try {
    return (await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('The browser wallet did not answer in time'))
      }, REQUEST_TIMEOUT)
      pending.set(id, { resolve, reject, timer })
      if (!bridgeSend({ type: 'wallet_req', token: token(), id, method, params })) {
        clearTimeout(timer)
        pending.delete(id)
        reject(new Error('Impulse bridge is offline'))
      }
    })) as never
  } finally {
    if (interactive) toast.dismiss(`bw-${id}`)
  }
}

const provider = { request, on: () => undefined, removeListener: () => undefined }

const ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#26262a"/><g fill="none" stroke="#ececef" stroke-width="1.6"><circle cx="14" cy="14" r="7.5"/><path d="M6.5 14h15M14 6.5c2.2 2.3 3.2 4.8 3.2 7.5S16.2 19.2 14 21.5M14 6.5c-2.2 2.3-3.2 4.8-3.2 7.5s1 5.2 3.2 7.5"/></g></svg>',
  )

export const browserWallet = (): Wallet => ({
  id: 'browserWallet',
  name: 'Browser wallet',
  shortName: 'Browser',
  iconUrl: ICON,
  iconBackground: '#26262a',
  installed: true,
  createConnector: (details) =>
    createConnector<typeof provider>((config) => {
      wire()
      const off: (() => void)[] = []
      const listen = (connector: { onAccountsChanged(a: string[]): void; onChainChanged(c: string): void; onDisconnect(): void }) => {
        off.forEach((f) => f())
        const fn = (event: string, data: unknown) => {
          if (event === 'accountsChanged') connector.onAccountsChanged((data as string[]) ?? [])
          else if (event === 'chainChanged') connector.onChainChanged(String(data))
          else if (event === 'disconnect') connector.onDisconnect()
        }
        events.add(fn)
        off.push(() => events.delete(fn))
      }
      return {
        ...details,
        id: 'browserWallet',
        name: 'Browser wallet',
        type: 'browserWallet',
        async connect({ chainId, isReconnecting } = {}) {
          if (!isReconnecting && !status.accounts.length) {
            window.open(pageUrl(), '_blank')
            toast.message('Finish connecting in your browser', { description: 'Pick Phantom, MetaMask or another wallet on the page Impulse opened. Keep that tab open while you trade.' })
          }
          const s = await waitForStatus((x) => x.accounts.length > 0, isReconnecting ? 2000 : CONNECT_TIMEOUT)
          listen(this)
          let current = s.chainId ?? 1
          if (chainId && chainId !== current && this.switchChain) current = (await this.switchChain({ chainId })).id
          return { accounts: s.accounts.map((a) => getAddress(a)) as never, chainId: current }
        },
        async disconnect() {
          off.forEach((f) => f())
          bridgeSend({ type: 'wallet_unlink', token: token() })
          status = { ...status, accounts: [] }
        },
        async getAccounts() {
          return status.accounts.map((a) => getAddress(a)) as Address[]
        },
        async getChainId() {
          return status.chainId ?? 1
        },
        async getProvider() {
          return provider
        },
        async isAuthorized() {
          // Reconnect silently on launch if the pairing tab is still open and connected.
          return waitForStatus(() => true, 1500).then((s) => s.accounts.length > 0, () => false)
        },
        async switchChain({ chainId }) {
          const chain = config.chains.find((c) => c.id === chainId)
          if (!chain) throw new Error(`Unsupported chain ${chainId}`)
          try {
            await request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] })
          } catch (e) {
            if ((e as { code?: number }).code !== 4902) throw e
            await request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: numberToHex(chainId), chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [...chain.rpcUrls.default.http], blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined }],
            })
          }
          status = { ...status, chainId }
          config.emitter.emit('change', { chainId })
          return chain
        },
        onAccountsChanged(accounts) {
          if (!accounts.length) this.onDisconnect()
          else config.emitter.emit('change', { accounts: accounts.map((a) => getAddress(a)) })
        },
        onChainChanged(chain) {
          config.emitter.emit('change', { chainId: Number(chain) })
        },
        onDisconnect() {
          config.emitter.emit('disconnect')
        },
      }
    }),
})
