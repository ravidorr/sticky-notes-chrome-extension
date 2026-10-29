# Edge Add-ons Publishing

Every pull request merged into `main` runs
`.github/workflows/publish-edge-addons.yml`. When the merge changed the version
in `package.json`, it builds the Edge package and submits it to Microsoft Edge
Add-ons for review through the
[Microsoft Edge Add-ons Publish API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api).
A merge that does not change the version, a pull request closed without
merging, and a run before the credentials exist submit nothing and do not fail
the run, unless the version cannot be read. The Chrome Web Store flow is
described in [CHROME_WEB_STORE_PUBLISHING.md](CHROME_WEB_STORE_PUBLISHING.md).

The workflow was written against the API documentation and has never run
against the real API, because the credentials do not exist yet. Watch the first
real submission (see [First run](#first-run)). Remove this note after the first
successful run.

## What you have to do once

### 1. Make the first submission by hand

The API only updates an existing product: Microsoft's documentation says "To
initially publish a new extension, you use Partner Center", and a publish for a
product that does not exist fails with `CreateNotAllowed`. Check whether the
product exists: it is listed under **Microsoft Edge** > **Overview** in
[Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd).
The ROADMAP links a Partner Center page with product ID
`e8c23177-3423-4a2e-9d99-949fbe77f9ae`, which is the value to use if that is the
product.

1. If there is no product, create it in Partner Center and complete the
   listing.
2. Build `dist/edge.zip` from `main` (`npm run build:edge`), upload it in
   Partner Center and submit it.
3. Wait until that submission is **Published**, not **In Review**. While a
   submission is in review, automated publishes fail with `InProgressSubmission`.
4. The version you submit by hand has to be lower than the next version bump,
   because the API publishes the draft as it is and the store would be expected
   to reject a lower version.

### 2. Create the API credentials

1. Sign in to the
   [Partner Center Microsoft Edge dashboard](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd)
   with the account that owns the extension.
2. Under the **Microsoft Edge** program, open **Publish API**.
3. If you still see **Access token URL** and **Secrets**, you are on the old
   (v1) experience. Click **Enable** next to "enable the new experience" to switch
   to API keys (v1.1), which this workflow uses.
4. Click **Create API credentials** (it can take a few minutes).
5. Copy the **Client ID** and the **API key**. Copy the key now; you may not be
   able to view it again.
6. Note the **Expiry** date of the API key and put a calendar reminder before it.
   A lapsed key makes every later release fail with HTTP 401. Create a new key
   and update the `EDGE_API_KEY` secret before then.

### 3. Find the product ID

In Partner Center, go to **Microsoft Edge** > **Overview** and open the
extension. The product ID is the GUID in the page's address, between
`microsoftedge/` and `/packages`, and is shown in the **Extension identity**
section.

### 4. Store them in the repository

The Client ID and API key are secrets. The product ID is not secret, so it is a
repository variable. Each command prompts for the value, so it does not land in
your shell history:

```bash
gh secret set EDGE_CLIENT_ID -R ravidorr/sticky-notes-chrome-extension
```

```bash
gh secret set EDGE_API_KEY -R ravidorr/sticky-notes-chrome-extension
```

```bash
gh variable set EDGE_PRODUCT_ID -R ravidorr/sticky-notes-chrome-extension
```

Or in the browser: add `EDGE_CLIENT_ID` and `EDGE_API_KEY` on the
[secrets page](https://github.com/ravidorr/sticky-notes-chrome-extension/settings/secrets/actions)
and `EDGE_PRODUCT_ID` on the
[variables page](https://github.com/ravidorr/sticky-notes-chrome-extension/settings/variables/actions).

| Name | Kind | Value |
| --- | --- | --- |
| `EDGE_CLIENT_ID` | secret | Client ID from the Publish API page |
| `EDGE_API_KEY` | secret | API key from the Publish API page |
| `EDGE_PRODUCT_ID` | variable | Product ID GUID of the extension |

Set all three. With only some of them set, the run fails and names the missing
ones.

## How it works

1. Checks out the merge commit with full history and sets up Node 20.
2. Runs `scripts/check-edge-addons-version.mjs`, which decides whether to
   submit. Chrome compares its build with the versions the store reports. The
   Edge API does not report the published version, so Edge compares the merge
   commit with its first parent:
   - It compares the `package.json` version at the merge commit with the one at
     `<merge commit>^1`, as Chrome manifest versions (so `1.2.3+8` is `1.2.3.8`,
     the way `scripts/manifest-version.mjs` writes them). The version changes
     together with the extension code, so an unchanged version means nothing to
     release. A higher version is submitted. A lower version is not submitted and
     gives a warning. Squash merges and merge commits are supported. The first
     parent is the previous tip of `main`, unlike the pull request base, which
     can be stale.
   - A manual run (**Run workflow**, allowed from `main` only) skips the
     comparison and submits the version on `main`.
   - Every outcome is written to the run summary with a status word:
     `SUBMITTED`, `SKIPPED (no release)`, `SKIPPED (credentials missing)`,
     `SKIPPED (version went DOWN)` or `FAILED`.
   - If none of the three settings is set, the run stays green. When the merge
     changed the version, it adds a warning saying that version was **not**
     submitted, which you can see on the run page. A merge without a version
     change says nothing. A pull request from a fork never has the secrets.
   - If only some settings are set, or a manual run lacks one, the run fails and
     names them.
3. Runs `npm ci` and `npm run build:edge`, which produces `dist/edge.zip`.
4. Runs `scripts/publish-edge-addons.mjs`. It first checks that
   `dist/edge/manifest.json` has the version of `package.json`, then:
   - `POST /v1/products/{productId}/submissions/draft/package` with the zip,
     then polls `GET .../submissions/draft/package/operations/{operationId}`
     every 10 seconds until it is `Succeeded`.
   - `POST /v1/products/{productId}/submissions` with release notes, then polls
     `GET .../submissions/operations/{operationId}` until it is `Succeeded`.
   - Requests carry `Authorization: ApiKey <key>` and `X-ClientID: <id>`. The
     values are never printed.
5. A concurrency group serializes runs. GitHub keeps only the newest pending run,
   so if several merges queue up, an older pending run is dropped.

The publish notes are sent as JSON (`{"notes": "..."}`). Microsoft's pages
contradict themselves here (JSON in one place, plain text in another). If the
first publish fails with HTTP 400, try plain text in `scripts/publish-edge-addons.mjs`.

### Retries, timeouts and errors

- HTTP 429, 408 and 5xx responses, timeouts, network errors and a connection
  that drops while a response is read are retried. A request is attempted up to
  five times (four retries), waiting 30, 60, 120 and 240 seconds, or the
  `Retry-After` value (at least 1 second, at most 240 seconds). After that the
  run fails with a message and nothing more is sent.
- The publish request is the exception: it is only retried after HTTP 429, which
  proves it was not processed. After a 5xx, a timeout or a network error the
  outcome is unknown, so the run fails and tells you to check Partner Center
  before starting another run. The same message is used when a poll fails or
  times out after the publish was accepted, with the operation ID.
- Every request times out after 60 seconds (the upload after 5 minutes), and all
  API work together stops after 25 minutes. The job itself stops after 30
  minutes.
- Other client errors are not retried. A 401 says the key was rejected and may
  have expired. A 404 points at the `EDGE_PRODUCT_ID` variable.
- If the API finds nothing new to publish (`NoModulesUpdated`), the run finishes
  with a warning naming the version, and a manual run fails.
- If an earlier submission is still in review (`InProgressSubmission`), the run
  fails, during the upload or the publish, and says the version was not
  submitted. After a failure at the publish step the new package is already in
  the Partner Center draft. Wait for the review to finish (or cancel it), then
  start a new run with **Run workflow** on `main`.
- Failures are written to the run summary and to an error annotation. GitHub
  only emails the person who started the run or merged the pull request. Alerting
  anyone else is a known limitation and is not built.

## What does not submit

- A pull request that changes only `public/manifest.edge.json` or other
  Edge-only files is not released on its own. The Version Bump check does not
  count those files as extension code and rejects a version bump in such a pull
  request, so the change ships with the next extension-code change. To ship it
  sooner, extend `scripts/extension-changes.mjs` to count
  `public/manifest.edge.json`.
- Merges that are dropped by the concurrency group. If the newer run's own pull
  request did not bump the version, the version of the dropped run is not
  submitted. Start a new run with **Run workflow** on `main`.

## First run

1. Complete the setup above.
2. Merge a pull request that bumps the version, or open the **Actions** tab, pick
   **Publish Edge Add-ons** and click **Run workflow** on `main`.
3. Open the run and read the logs of **Upload to Edge Add-ons and publish**.
   You should see the upload accepted, the upload succeeded, the publish accepted
   and a "Successfully created submission" message.
4. In Partner Center the submission appears as in review. Microsoft reviews it
   before it goes live.

Two details are not certain from the documentation and are the first thing to
check if the first run fails: the publish notes body (see above), and the
`Location` header of the 202 response, which is read as the operation ID (a bare
ID or a path ending in it).

## Troubleshooting

Do not use **Re-run** on an old run: it replays the old merge commit. Start a new
run with **Run workflow** on `main` instead.

| Symptom | Cause and fix |
| --- | --- |
| Warning "SKIPPED (credentials missing)" | The secrets and the variable are not set, and this version was not submitted. Set them as described above, then start a new run with Run workflow on `main`. |
| Run fails naming missing settings | Only some of the three are set, or a manual run lacks one. Set the rest. |
| `HTTP 401` | The Client ID or API key is wrong, or the API key expired. Create a new key on the Publish API page and update `EDGE_API_KEY`. |
| `HTTP 404` | `EDGE_PRODUCT_ID` is wrong, or the product belongs to another account. |
| `HTTP 429` after five attempts | The API throttled the requests. Start a new run with Run workflow on `main` later. |
| `CreateNotAllowed` ("Can't create new extension") | The product does not exist yet. Create it in Partner Center first (see step 1). |
| `Edge Add-ons rejected the package` | The upload operation failed. Read the message and error code in the log, fix the package, and bump the version. |
| `An earlier submission is still in review` | Wait for the review, or cancel it in Partner Center, then start a new run with Run workflow on `main`. After a failure at the publish step the draft already holds the new package. |
| Publish "outcome is unknown" | The publish request may or may not have been processed. Check Partner Center before starting another run. |
| Publish fails with a validation error | Partner Center needs something the API cannot fix, for example listing metadata or a certification note. Fix it in Partner Center and start a new run. |
| Warning "found nothing new to publish" | The draft equals the current submission, so there was nothing to release. |
| Version bumped but nothing was submitted | The run may have been dropped by the concurrency group. Start a new run with Run workflow on `main`. |
| Edge sign-in fails in the published build | The Edge Add-ons store assigns its own extension ID. Register `https://<store-extension-id>.chromiumapp.org/` as an authorized redirect URL on the Edge OAuth web-application client in Google Cloud (see the OAuth section of [FIREBASE_SETUP.md](FIREBASE_SETUP.md)). |
