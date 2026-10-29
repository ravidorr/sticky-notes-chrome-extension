# Chrome Web Store Publishing

Every pull request merged into `main` runs
`.github/workflows/publish-chrome-web-store.yml`, which builds the Chrome
package. It submits the package to the Chrome Web Store for review only when
the version is new, and the version changes only when the extension code
changes. Changes to documentation, CI, tests, the website or the Cloud
Functions never submit a release. Pull requests that are closed without
merging do nothing, and the regular CI workflow is unchanged.

## How it works

1. Checks out the merged code, runs `npm ci`, then `npm run build:chrome`.
   The build converts the `package.json` version into a valid manifest version
   (for example `1.20.3+8` becomes `1.20.3.8`) and fails on invalid versions.
   It produces `dist/chrome.zip`.
2. Authenticates to Google Cloud with GitHub Actions OIDC and Workload Identity
   Federation. No long-lived credentials are stored.
3. Decides whether a submission is needed
   (`scripts/check-chrome-web-store-version.mjs`), by comparing the manifest
   version with the versions the store has:
   - A version the store already serves, or already has in review, is not
     submitted again. The run succeeds, skips steps 4 to 6, and says why in the
     run summary.
   - A version lower than one the store has fails the run, because the store
     rejects it.
   - Any other version is new and goes on to step 4.
4. Cancels the previous submission if its state is `PENDING_REVIEW` or `STAGED`.
   Other known states (`PUBLISHED`, `PUBLISHED_TO_TESTERS`, `REJECTED`,
   `CANCELLED`) pass through. Any other state fails the run.
   The store limits how often a publisher can cancel a submission and answers
   HTTP 429 when the limit is reached. The step waits 30, 60, 120 and 240 seconds
   between up to five attempts. If it still gets 429, the run fails with a message
   and nothing is submitted. Cancel the pending submission by hand in the
   [developer dashboard](https://chrome.google.com/webstore/devconsole), or wait
   for the limit to reset, then re-run the workflow. A later merge also retries a
   version the store does not have yet.
5. Uploads `dist/chrome.zip` and polls until processing finishes (up to five
   minutes).
6. Submits the upload with default publishing and review enabled
   (`publishType: DEFAULT_PUBLISH`, `skipReview: false`, `blockOnWarnings: true`).

The job has only `contents: read` and `id-token: write` permissions. A
concurrency group serializes submissions. If several merges queue up while a
run is in progress, GitHub keeps only the newest pending run. This is
intended: the last run builds the latest `main`, which includes the earlier
changes and the highest version. API error bodies are printed in the workflow
logs.

## When the version changes

The version moves together with the extension code, so a release is submitted
exactly when the extension changes. The `Version Bump` workflow
(`.github/workflows/version-bump.yml`, `scripts/validate-version-bump.mjs`)
enforces both directions on every pull request:

- A pull request that changes extension code must bump the version in
  `package.json`, in both places in `package-lock.json`, and in the supported
  version in `SECURITY.md`.
- A pull request that does not change extension code must not bump it, because
  the bump would submit a release. The check fails and says to restore the
  version.

Extension code is:

- `src/`, except test files
- the files in `public/` that `scripts/build.js` copies into the package:
  `manifest.json`, `icons/icon16.png`, `icon32.png`, `icon48.png`,
  `icon128.png` and `_locales/`. Other files there, such as
  `manifest.edge.json` (Edge only) and `icons/icon16.svg`, never ship
- the build configuration: `scripts/build.js`, `scripts/manifest-build.mjs`,
  `scripts/manifest-key.mjs` and
  `scripts/manifest-version.mjs`
  (`vite.config.js` is not included: the build runs Vite with `configFile: false`)
- dependency changes in `package.json` (`dependencies`, `devDependencies`,
  `optionalDependencies`, `peerDependencies`, `overrides`) or in
  `package-lock.json`, beyond the version of the package itself

Everything else is not extension code: documentation, `README.md`, `site/`,
`functions/`, tests, the CI workflows, other scripts, and changes to the
`scripts`, lint or other settings in `package.json`.

Run the same check locally with `npm run verify:version-bump`, after
committing, because it compares the commits on your branch with `origin/main`.
The rules are covered by `npm run test:version-gate`.

Because the version only changes with extension code, a release that the store
rejected or that someone canceled is not submitted again by a later merge that
leaves the extension alone. To release that code again, upload the package from
the dashboard, or change the extension code and bump the version.

## Required repository variables

Set these under Settings, Secrets and variables, Actions, Variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name, `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_SERVICE_ACCOUNT` | Service account email, `<name>@<project>.iam.gserviceaccount.com` |
| `CWS_EXTENSION_ID` | The extension ID from the Chrome Web Store developer dashboard |
| `CWS_PUBLISHER_ID` | The publisher ID, the first ID in the developer dashboard URL |

## Google Cloud setup

1. Enable the Chrome Web Store API in the Google Cloud project.
2. Create a service account for publishing.
3. Create a Workload Identity pool and an OIDC provider with issuer
   `https://token.actions.githubusercontent.com`. Add an attribute condition
   that restricts it to this repository, for example
   `assertion.repository == 'ravidorr/sticky-notes-chrome-extension'`.
4. Grant the principal for this repository the
   `roles/iam.workloadIdentityUser` role on the service account.

## Chrome Web Store setup

1. In the [developer dashboard](https://chrome.google.com/webstore/devconsole),
   open Settings and check the Service account section. A publisher can have
   only one service account. If one is set, reuse it: add a provider for this
   repository to its Workload Identity pool and bind this repository to that
   service account, instead of replacing it. Otherwise enter the new service
   account email there.
2. Copy the extension ID and publisher ID into the repository variables above.
   The publisher ID is the first ID in the dashboard URL.

## Troubleshooting

- `fetchStatus failed (403)`: the service account is not authorized for the
  publisher, or the Chrome Web Store API is not enabled.
- `Unexpected Chrome Web Store submitted revision state`: the store reported a
  state the workflow does not handle. Check the printed status JSON in the logs
  and resolve it in the dashboard.
- The run succeeded but nothing was submitted: the store already has this
  version, published or in review, so there was no extension change to release.
  The run summary shows the versions the store has.
- `Chrome Web Store already has a higher version ...`: the version in
  `package.json` is lower than one the store has, published or in review. Check
  that the version was not lowered, and that a stale run did not build older
  code.
- Upload fails: the printed response includes the store's error details, such
  as a manifest or version that is not higher than the published one.
