# Real-time subscriptions in the background worker

The MV3 background service worker holds the Firestore listeners for real-time notes and comments. Chrome
stops the worker when it is idle, which drops every listener. The worker therefore keeps two states and
makes the second match the first.

## Two states

- **Desired**: an in-memory `Map` per kind (notes, comments) of entries `{ descriptor, confirmed }` by
  key. Note keys are `${tabId}-${frameId}`, comment keys are `${tabId}-${noteId}`. `confirmed` is true for an
  entry a page just wrote and false for one read back from storage. It is hydrated once from
  `chrome.storage.session` and written through to it (`subscriptionStore.js`). The store is never read again.
- **Actual**: the `noteSubscriptions` and `commentSubscriptions` maps of listeners.

`degraded` (from `getRealtimeSyncStatus`) is derived: any desired key that has no listener. Nothing is
persisted for it.

## Requests

Every request replaces or deletes the desired entry, then queues `reconcile(kind, key)` on a promise chain
per key:

- subscribe: new entry, `confirmed: true`
- unsubscribe: delete the entry
- tab closed (`releaseTab`): delete every entry of the tab and remember the tab as closed
- tab unreachable (a failed `tabs.sendMessage`): delete the entry only if it is still the listener's own

A reconcile step reads the latest desired entry and compares it with the actual listener:

- no entry: release the listener
- the listener was started for another entry: release it, then start the entry
- the listener was started for this entry: nothing to do

A request that was superseded while it waited in the chain returns `{ success: true, cancelled: true }`. An
unsubscribe that arrives during a subscribe in flight queues behind it and releases the new listener right
after it registers. A failed start keeps its desired entry, so a later attempt can retry it.

## Background attempts

A restore (worker start), a retry (keep-alive alarm) and a login resume (`reconcileAll`) start entries the
page did not just write. Each one first checks the live tab and frame (`tabs.get`,
`webNavigation.getAllFrames`, through `findLiveFrames` and `checkDescriptor`) and compares the URL. A closed tab,
a missing frame or a navigated frame drops the entry. After the lookups, a single identity check
(`desired.get(key) === entry`) skips an entry a page replaced meanwhile.

## Outcomes and retries

A start ends with one of `ok`, `no-user`, `not-configured`, `unavailable` or `transient`.

- `transient` (any error, and a timeout of `SUBSCRIBE_TIMEOUT_MS`, 10 seconds, on the user lookup or the
  subscribe call) is retried on the `keepAlive` alarm after 1, 2 and 4 ticks and then every 8 ticks. A listener
  that resolves after its timeout is released and never registered.
- `no-user` pauses the entry. A login starts it again (`handleLogin` calls `reconcileAll`).
- `not-configured` and `unavailable` are logged once and tried again only at a worker start or on a new request.

A logout (`handleLogout`) calls `clearAll` after the sign out succeeds: it releases every listener, empties the
desired maps and clears the store.

## Storage failures

Memory stays authoritative. Every change writes the whole state, so a failed write is fixed by the next one. If
the stored state cannot be read, changes stay in memory and nothing is written until a later read works; then
they merge on top of it, with requests winning per key.

## Wiring

`createBackgroundRuntime` in `runtime.js` builds the store and the handlers, registers the tab cleanup and the
alarm, and restores the subscriptions on start. `index.js` only calls it.
