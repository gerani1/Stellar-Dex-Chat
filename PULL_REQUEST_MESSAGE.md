# PR: Wave 66 - Offline Banner + Read-only Retry Queue

Closes #66

## ✅ What this PR adds
- `src/lib/networkQueue.ts`: generic read-only network queue and retry logic
- `src/lib/stellarContract.ts`: `viewCall` now uses `withNetworkReadQueue` for contract view operations (`getAdmin`, `getBridgeLimit`, etc.)
- `src/components/StellarChatInterface.tsx`: online/offline detection and offline banner
  - renders message when offline with queued requests count
  - listens to `window.online` and `window.offline`

## 🎯 Acceptance criteria coverage
1. Offline indicator when network drops
   - `StellarChatInterface` shows top warning bar when `navigator.onLine === false`
2. Queue failed read-only requests and retry when online
   - `withNetworkReadQueue()` enqueues failed read-only tasks
   - retry executed on `online` event
3. Do not auto-retry write actions requiring wallet signatures
   - `depositToContract`, `withdrawFromContract`, `simulate*` are unchanged and not wrapped

## 🛠️ Technical details
- `networkQueue` uses lightweight queue + `MAX_RETRY = 5`.
- HTTP/Fetch or RPC offline classification through `isNetworkError`.
- `stellarContract.viewCall` is now queued logic and does not retry write actions.
- `StellarChatInterface` exposes queue status to user.

## 🧪 Validation
Run:
```bash
cd dex_with_fiat_frontend
npm install
npm run build
```
Build succeeded (no errors).

## 📸 Proof / attachment
- [ ] attach screenshot of offline banner and console logs showing queue + retries

**How to attach proof:**
1. Run app and trigger offline mode (browser network toggle or OS airplane mode)
2. Confirm banner appears, then run a read query (requiring on-chain data)
3. Switch online and confirm the queued request resolves
4. Save screenshot and upload as PR attachment to this issue

> Attach screenshot below when ready:
>
> ![Attachment placeholder](./attachment.png)
