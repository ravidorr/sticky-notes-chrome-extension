# Chrome Web Store Publishing

Every pull request merged into `main` triggers
`.github/workflows/publish-chrome-web-store.yml`, which builds the Chrome
package and submits it to the Chrome Web Store for review. Pull requests that
are closed without merging do nothing, and the regular CI workflow is unchanged.

## How it works

1. Checks out the merged code, runs `npm ci`, then `npm run build:chrome`.
   The build converts the `package.json` version into a valid manifest version
   (for example `1.20.3+8` becomes `1.20.3.8`) and fails on invalid versions.
   It produces `dist/chrome.zip`.
2. Authenticates to Google Cloud with GitHub Actions OIDC and Workload Identity
   Federation. No long-lived credentials are stored.
3. Fails when the store already serves the manifest version
   (`scripts/check-chrome-web-store-version.mjs`). The store rejects an
   unchanged version, and this check fails before the previous submission is
   cancelled.
4. Cancels the previous submission if its state is `PENDING_REVIEW` or `STAGED`.
   Other known states (`PUBLISHED`, `PUBLISHED_TO_TESTERS`, `REJECTED`,
   `CANCELLED`) pass through. Any other state fails the run.
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

Every pull request must bump the version in `package.json` (and keep
`package-lock.json` and the supported version in `SECURITY.md` in sync).
The `Version Bump` workflow (`.github/workflows/version-bump.yml`) fails pull
requests that do not, and you can run the same check locally with
`npm run verify:version-bump`. A merge that somehow leaves the version
unchanged fails the workflow with a clear message instead of being skipped.
The publish workflow ignores changes that touch only `docs/**` or Markdown
files, but a pull request that bumps the version also changes `package.json`,
so it is not ignored and it publishes.

## Required repository variables

Set these under Settings, Secrets and variables, Actions, Variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name, `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_SERVICE_ACCOUNT` | Service account email, `<name>@<project>.iam.gserviceaccount.com` |
| `CWS_EXTENSION_ID` | The extension ID from the Chrome Web Store developer dashboard |
| `CWS_PUBLISHER_ID` | The publisher ID shown in the dashboard account settings |

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

1. In the developer dashboard, add the service account email as a trusted
   publisher account for the extension's publisher.
2. Copy the extension ID and publisher ID into the repository variables above.

## Troubleshooting

- `fetchStatus failed (403)`: the service account is not authorized for the
  publisher, or the Chrome Web Store API is not enabled.
- `Unexpected Chrome Web Store submitted revision state`: the store reported a
  state the workflow does not handle. Check the printed status JSON in the logs
  and resolve it in the dashboard.
- `Chrome Web Store already serves version ...`: the merged code has the same
  version as the published one. Bump `package.json` and merge again.
- Upload fails: the printed response includes the store's error details, such
  as a manifest or version that is not higher than the published one.
