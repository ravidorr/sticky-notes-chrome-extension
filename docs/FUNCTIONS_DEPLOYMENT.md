# Firebase Functions Deployment

Every push to `main` that changes `functions/**` or `firebase.json` triggers
`.github/workflows/deploy-functions.yml`, which deploys the Cloud Functions to
the `sticky-notes-chrome-extension` Firebase project. The workflow can also be
started by hand from the Actions tab (`workflow_dispatch`). Pull requests that
only change the extension, the site or the docs do not deploy.

## How it works

1. Checks out the merged code and runs `npm ci` in `functions/`. Firebase reads
   the function code locally to discover the triggers, so the dependencies must
   be installed.
2. Authenticates to Google Cloud with GitHub Actions OIDC and Workload Identity
   Federation, as the deploy service account. No long-lived credentials are
   stored.
3. Writes `functions/.env.sticky-notes-chrome-extension` from the `SMTP_USER`
   and `MAIL_FROM` repository variables. These are the non-secret function
   parameters, and the file is git-ignored locally. The workflow fails with a
   clear message when either variable is missing.
4. Runs `firebase deploy --only functions --non-interactive`, pinned to the
   Firebase CLI version in the workflow.

The `SMTP_PASSWORD` secret is not touched by the workflow. It lives in Secret
Manager and the function reads it at runtime. Set it once with
`firebase functions:secrets:set SMTP_PASSWORD`.

The job has only `contents: read` and `id-token: write` permissions. A
concurrency group serializes deploys, and GitHub keeps only the newest pending
run. The newest run deploys the latest `main`, so dropping older pending runs
is intended.

Only functions are deployed. Firestore rules and indexes are not, so a change
to `firestore.rules` still needs `firebase deploy --only firestore:rules`.

## Required repository variables

Set these under Settings, Secrets and variables, Actions, Variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name. Already set for Chrome Web Store publishing, and shared. |
| `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | Email of the deploy service account, `firebase-deploy@sticky-notes-chrome-extension.iam.gserviceaccount.com` |
| `SMTP_USER` | The SMTP username, for example the Gmail address that sends the emails |
| `MAIL_FROM` | The default From address, normally the same as `SMTP_USER` |

## Google Cloud setup

Use a separate service account from the Chrome Web Store publisher, so each
credential can do only its own job. Run these once, with an account that can
manage IAM on the project:

```bash
PROJECT=sticky-notes-chrome-extension
SA=firebase-deploy@${PROJECT}.iam.gserviceaccount.com

gcloud services enable iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com --project "$PROJECT"

gcloud iam service-accounts create firebase-deploy \
  --display-name "Firebase functions deploy" --project "$PROJECT"

for role in roles/cloudfunctions.admin roles/run.admin \
  roles/cloudbuild.builds.editor roles/artifactregistry.writer \
  roles/eventarc.admin roles/firebase.viewer \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:${SA}" --role "$role" --condition=None
done

# Deploying acts as the functions runtime service account
gcloud iam service-accounts add-iam-policy-binding \
  "413613230006-compute@developer.gserviceaccount.com" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountUser \
  --project "$PROJECT"

# Let the deploy bind the SMTP secret to the function
gcloud secrets add-iam-policy-binding SMTP_PASSWORD \
  --member "serviceAccount:${SA}" --role roles/secretmanager.admin \
  --project "$PROJECT"
```

The Workload Identity pool is shared with Chrome Web Store publishing. It lives
in the `shortcuts-for-messages` Google Cloud project (number `624640566757`,
pool `github-actions`, provider `sticky-notes`), not in this Firebase project.
A pool can impersonate a service account in another project, so the deploy
service account stays here and only needs this binding. The provider is already
restricted to this repository and maps `attribute.repository`:

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role roles/iam.workloadIdentityUser --project "$PROJECT" \
  --member "principalSet://iam.googleapis.com/projects/624640566757/locations/global/workloadIdentityPools/github-actions/attribute.repository/ravidorr/sticky-notes-chrome-extension"
```

If `gcloud` has a different active account or default project, add
`--account` and `--project` to every command so nothing runs against the wrong
project.

The role list is a starting point. Google may ask for more or fewer
permissions as the Firebase CLI changes, so read the first run's error, which
names any missing permission, and trim the roles after a successful deploy.

## Behavior to know about

- A merge deploys to production with no manual step. The pull request checks
  (lint, tests, version bump) are the safety net. A deploy failure does not
  undo the merge, so fix forward.
- Removing a function from the code does not delete it in the cloud. A
  non-interactive deploy stops and asks for a manual `firebase functions:delete`.
- Every pull request bumps the version, and the Chrome Web Store workflow
  publishes on every merge. A change under `functions/` therefore also submits a
  new store version.

## Troubleshooting

- `Permission denied` or `403` naming a permission: grant the service account
  the role that contains it, then re-run the workflow from the Actions tab.
- `Set the SMTP_USER repository variable`: add the missing variable above.
- `Failed to authenticate`: check `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `FIREBASE_DEPLOY_SERVICE_ACCOUNT` and the `workloadIdentityUser` binding.
- `functions ... do not exist in your local source code`: delete the stale
  function by hand, as described above.
- Deploy fails on the `SMTP_PASSWORD` secret: confirm it has a version with
  `firebase functions:secrets:get SMTP_PASSWORD`.
