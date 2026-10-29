# Edge Add-ons Publishing

Every pull request merged into `main` runs
`.github/workflows/publish-edge-addons.yml`. When the merge changed the version
in `package.json`, it builds the Edge package and submits it to Microsoft Edge
Add-ons for review through the
[Microsoft Edge Add-ons Publish API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api).
Merges that do not change the version, pull requests closed without merging,
and runs before the credentials exist submit nothing and never fail the merge.

The workflow was written against the API documentation. It has never run
against the real API, because the credentials do not exist yet. Watch the first
real submission (see [First run](#first-run)).

## What you have to do once

### 1. Make the first submission by hand

The API only updates an existing product; it cannot create one or change its
listing. The product already exists in Partner Center. Make sure its latest
submission is in a normal state (published, or in review). The API publishes the
draft, so a draft that is half edited by hand will be submitted as it is.

### 2. Create the API credentials

1. Sign in to the
   [Partner Center Microsoft Edge dashboard](https://partner.microsoft.com/dashboard/microsoftedge/public/login?ref=dd)
   with the account that owns the extension.
2. Under the **Microsoft Edge** program, open **Publish API**.
3. If you still see **Access token URL** and **Secrets**, you are on the old
   (v1) experience. Click **Enable** next to "enable the new experience" to switch
   to API keys (v1.1), which this workflow uses.
4. Click **Create API credentials** (it can take a few minutes).
5. Copy the **Client ID** and the **API key**. The API key is only shown right
   after creating it. Note the **Expiry** date shown for the key: when it
   expires, create a new one and update the secret (see
   [Troubleshooting](#troubleshooting)).

### 3. Find the product ID

In Partner Center, go to **Microsoft Edge** > **Overview** and open the
extension. The product ID is the GUID in the page's address, between
`microsoftedge/` and `/packages`, and is shown in the **Extension identity**
section.

### 4. Store them in the repository

The Client ID and API key are secrets. The product ID is not secret, so it is a
repository variable. From a checkout of the repository, with the GitHub CLI
signed in as an admin (each command prompts for the value, so it does not land
in your shell history):

```bash
gh secret set EDGE_CLIENT_ID
```

```bash
gh secret set EDGE_API_KEY
```

```bash
gh variable set EDGE_PRODUCT_ID
```

Or in the browser, on the repository's Settings > Secrets and variables >
Actions page: add `EDGE_CLIENT_ID` and `EDGE_API_KEY` under **Secrets**, and
`EDGE_PRODUCT_ID` under **Variables**.

| Name | Kind | Value |
| --- | --- | --- |
| `EDGE_CLIENT_ID` | secret | Client ID from the Publish API page |
| `EDGE_API_KEY` | secret | API key from the Publish API page |
| `EDGE_PRODUCT_ID` | variable | Product ID GUID of the extension |

## How it works

1. Checks out the merge commit with full history and sets up Node 20.
2. Runs `scripts/check-edge-addons-version.mjs`, which decides whether to
   submit:
   - If any of the three settings is missing, it prints a notice that Edge
     publishing is skipped, the run succeeds, and the remaining steps are
     skipped. This is the state until you finish the setup above.
   - It compares the `package.json` version at the pull request base with the
     one at the merge commit, as Chrome manifest versions (so `1.2.3+8` is
     `1.2.3.8`, the way `scripts/manifest-version.mjs` writes them). The version
     changes together with the extension code, so an unchanged version means
     nothing to release. A higher version is submitted. A lower version is not
     submitted.
   - A manual run (**Run workflow**) skips the comparison and submits the version
     on `main`.
3. Runs `npm ci` and `npm run build:edge`, which produces `dist/edge.zip`.
4. Runs `scripts/publish-edge-addons.mjs`:
   - `POST /v1/products/{productId}/submissions/draft/package` with the zip,
     then polls `GET .../submissions/draft/package/operations/{operationId}`
     every 10 seconds (up to 10 minutes) until it is `Succeeded`.
   - `POST /v1/products/{productId}/submissions` with release notes, then polls
     `GET .../submissions/operations/{operationId}` until it is `Succeeded`.
   - Requests carry `Authorization: ApiKey <key>` and `X-ClientID: <id>`. The
     values are never printed.
5. A concurrency group serializes runs. GitHub keeps only the newest pending run,
   so if several merges queue up, an older pending run is dropped.

### Retries and errors

- HTTP 429, 5xx and network errors are retried up to five times, waiting 30, 60,
  120 and 240 seconds (or the `Retry-After` header when the API sends one). After
  that the run fails with a message and nothing more is submitted.
- Other client errors are not retried. A 401 says the key was rejected and may
  have expired. A 404 points at the `EDGE_PRODUCT_ID` variable.
- If the API says there is nothing new to publish (`NoModulesUpdated`), the run
  succeeds and says so.
- If an earlier submission is still in review (`InProgressSubmission`), the run
  fails and says the version was not submitted. Re-run the workflow once the
  review finishes.

## What does not submit

- A pull request that changes only `public/manifest.edge.json` or other
  Edge-only files does not change the version (the version gate does not count
  them as extension code), so it is not submitted by itself. The next version
  bump carries it. To release one sooner, bump the version in a pull request.
- Merges that are dropped by the concurrency group. If the newer run's own pull
  request did not bump the version, the version of the dropped run is not
  submitted. Start the workflow by hand to submit the current version.

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
check if the first run fails: the notes body of the publish request is sent as
JSON (`{"notes": "..."}`), and the `Location` header of the 202 response is read
as the operation ID (a bare ID or a path ending in it).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Run says "Edge publishing is skipped: ... not configured" | The secrets or the variable are missing. Set them as described above. |
| `HTTP 401` | The Client ID or API key is wrong, or the API key expired. Create a new key on the Publish API page and update `EDGE_API_KEY`. |
| `HTTP 404` | `EDGE_PRODUCT_ID` is wrong, or the product belongs to another account. |
| `HTTP 429` after five attempts | The API throttled the requests. Re-run the workflow later. |
| `Edge Add-ons rejected the package` | The upload operation failed. Read the message and error code in the log, fix the package, and bump the version. |
| `An earlier submission is still in review` | Wait for the review, or cancel it in Partner Center, then re-run the workflow. |
| Publish fails with a validation error | Partner Center needs something the API cannot fix, for example listing metadata or a certification note. Fix it in Partner Center and re-run. |
| Version bumped but nothing was submitted | The run may have been dropped by the concurrency group. Start the workflow by hand. |
| Edge sign-in fails in the published build | The store-assigned extension ID gives a redirect URL that has to be registered on the Edge OAuth client. See [Step 8.5](FIREBASE_SETUP.md#85-edge-development-builds-web-application-client) of the Firebase setup guide. |
