# Firebase Functions Deployment

Every push to `main` that changes `functions/**`, `firebase.json` or
`.github/workflows/deploy-functions.yml` triggers the workflow in that file,
which deploys the Cloud Functions to the `sticky-notes-chrome-extension`
Firebase project.
Note that a `firebase.json` change, such as new hosting headers, also redeploys
the functions. Pull requests that only change the extension, the site or the
docs do not deploy.

Because the workflow file itself is in the path filter, merging a pull request
that adds or edits it also deploys. A new setup should finish the first-run
checklist below first.

## First-run checklist

1. Make sure the secret exists and has a version:
   `firebase functions:secrets:set SMTP_PASSWORD` (for Gmail, use an
   [app password](https://myaccount.google.com/apppasswords)). The secret
   binding in the Google Cloud setup fails if the secret does not exist.
2. Create the `functions-production` GitHub environment, as described in
   [Who can deploy](#who-can-deploy). Do this before the first run. If the job
   runs first, GitHub creates the environment without a branch rule and the
   deploy still passes, but the restriction to `main` does not apply.
3. Create the deploy service account and its bindings (Google Cloud setup).
4. Set the four repository variables listed below.
5. Deploy any event function that uses `retry: true` by hand once, with
   `firebase deploy --only functions`. A non-interactive deploy can refuse
   to enable a retry policy for the first time unless it is forced, and forcing
   it would also delete functions that are missing from the code. `sendMail`
   (options in `functions/lib/mailTrigger.js`) is the only such function today.
6. Merge. The first run is the real test of the setup.

## How it works

1. Checks out the merged code and runs `npm ci` in `functions/`. Firebase reads
   the function code locally to discover the triggers, so the dependencies must
   be installed. The Node version comes from `engines.node` in
   `functions/package.json`.
2. Authenticates to Google Cloud with GitHub Actions OIDC and Workload Identity
   Federation, as the deploy service account. No long-lived credentials are
   stored.
3. Writes `functions/.env.sticky-notes-chrome-extension` from the `SMTP_USER`
   and `MAIL_FROM` repository variables. These are the non-secret function
   parameters, and the file is git-ignored locally. The workflow fails with a
   clear message when either variable is missing, or contains `#` or a newline.
4. Runs `firebase deploy --only functions --non-interactive`, pinned to the
   Firebase CLI version in the workflow.

The job runs only for `main`. A manual run started from another branch is
skipped, so it cannot deploy that branch to production.

The `SMTP_PASSWORD` secret is not touched by the workflow. It lives in Secret
Manager and the function reads it at runtime.

The job has only `contents: read` and `id-token: write` permissions. A
concurrency group serializes deploys, and GitHub keeps only the newest pending
run. The newest run deploys the latest `main`, so dropping older pending runs
is intended. A run replaced while pending shows as canceled in the Actions tab.

Only functions are deployed. Firestore rules and indexes are not, and neither is
hosting. Deploy rules and indexes with `firebase deploy --only firestore`
(or `firestore:rules` or `firestore:indexes`).

To re-run a deploy, open Actions, Deploy Firebase Functions, Run workflow, and
select `main`, or re-run a failed run.

## Required repository variables

Set these under Settings, Secrets and variables, Actions, Variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/624640566757/locations/global/workloadIdentityPools/github-actions/providers/sticky-notes`. Shared with Chrome Web Store publishing, see [that doc](CHROME_WEB_STORE_PUBLISHING.md). |
| `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | Email of the deploy service account, `firebase-deploy@sticky-notes-chrome-extension.iam.gserviceaccount.com` |
| `SMTP_USER` | The SMTP username, for example the Gmail address that sends the emails |
| `MAIL_FROM` | The default From address, normally the same as `SMTP_USER` |

Repository variables are not secret and are visible to anyone who can read the
repository settings. Keep only non-sensitive values in them. The password stays
in Secret Manager.

## Google Cloud setup

Use a separate service account from the Chrome Web Store publisher, so each
credential can do only its own job. Run the commands once, in one shell
session, with an account that can manage IAM on the project. The secret
binding needs the secret to exist, so complete step 2 of the checklist first:

```bash
PROJECT=sticky-notes-chrome-extension
SA=firebase-deploy@${PROJECT}.iam.gserviceaccount.com
# 413613230006 is this project's number. The v2 functions run as its default
# compute service account, which the deploy has to act as.
RUNTIME_SA=413613230006-compute@developer.gserviceaccount.com
# The Firebase CLI also checks that it can act as the App Engine default
# service account, even though the functions do not run as it.
APPENGINE_SA=${PROJECT}@appspot.gserviceaccount.com

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

for target in "$RUNTIME_SA" "$APPENGINE_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$target" \
    --member "serviceAccount:${SA}" --role roles/iam.serviceAccountUser \
    --project "$PROJECT"
done

# Let the deploy bind the SMTP secret to the function
gcloud secrets add-iam-policy-binding SMTP_PASSWORD \
  --member "serviceAccount:${SA}" --role roles/secretmanager.admin \
  --project "$PROJECT"

# Let the deploy job impersonate the deploy service account. The pool is in
# the shortcuts-for-messages project (number 624640566757, pool
# github-actions, provider sticky-notes), shared with Chrome Web Store
# publishing. A pool can impersonate a service account in another project.
# The binding is scoped to the functions-production environment, which only
# allows main (see Who can deploy). It relies on the provider mapping
# google.subject to assertion.sub.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role roles/iam.workloadIdentityUser --project "$PROJECT" \
  --member "principal://iam.googleapis.com/projects/624640566757/locations/global/workloadIdentityPools/github-actions/subject/repo:ravidorr/sticky-notes-chrome-extension:environment:functions-production"
```

If `gcloud` has a different active account or default project, add
`--account` and `--project` to every command so nothing runs against the wrong
project.

The role list is a starting point. The Firebase CLI may need other permissions
over time, so read the first run's error, which names any missing permission,
and trim the roles after a successful deploy.

## Who can deploy

Three things restrict who can deploy. The first is a convenience, and the other
two are enforced outside the repository's files:

1. The job runs only for `main` (`if: github.ref == 'refs/heads/main'`). This
   is not a security boundary, because anyone who can push a branch can edit
   the workflow file. It keeps a manual run from another branch from deploying
   by accident.
2. The job uses the `functions-production` GitHub environment, which has a
   deployment branch rule that allows only `main`. GitHub enforces the rule and
   refuses to start a job for this environment from any other branch.
3. The service account's `workloadIdentityUser` binding is scoped to that
   environment's OIDC subject,
   `repo:ravidorr/sticky-notes-chrome-extension:environment:functions-production`.
   Google enforces it. A workflow on another branch cannot get a token with
   that subject, even if it requests `id-token: write`.

The provider itself still trusts the whole repository, which the Chrome Web
Store publisher relies on. Only the deploy service account is scoped further.
Keep it that way: the deploy service account must have only the
environment-scoped binding. A repository-wide `principalSet://.../attribute.repository/...`
binding on it would let any workflow in the repository deploy, so remove one if
you find it.
The subject-scoped binding works because the provider maps `google.subject` to
`assertion.sub`. Check the mapping with:

```bash
gcloud iam workload-identity-pools providers describe sticky-notes \
  --workload-identity-pool github-actions --location global \
  --project shortcuts-for-messages --format='value(attributeMapping)'
```

Create the environment once:

```bash
gh api -X PUT repos/ravidorr/sticky-notes-chrome-extension/environments/functions-production \
  --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api -X POST repos/ravidorr/sticky-notes-chrome-extension/environments/functions-production/deployment-branch-policies \
  --input - <<'JSON'
{"name":"main","type":"branch"}
JSON
```

## Behavior to know about

- A merge deploys to production with no manual step. The only check that
  `main` requires today is the version bump, so a merge can deploy with failing
  lint or tests unless you also mark those checks as required. A deploy failure
  does not undo the merge, so fix forward.
- A local `firebase deploy` can drift from what is on `main`. The next merge
  that touches the paths above overwrites it.
- Removing a function from the code does not delete it in the cloud. A
  non-interactive deploy stops instead of deleting it, so remove it by hand with
  `firebase functions:delete`.
- Keep three Node settings in line when upgrading the runtime: `runtime` in
  `firebase.json`, `engines.node` in `functions/package.json`, and the Node
  versions that the CI jobs use. The deploy job follows `engines.node`.
- Every pull request bumps the version, and the Chrome Web Store workflow
  publishes on every merge, as described in
  [Chrome Web Store Publishing](CHROME_WEB_STORE_PUBLISHING.md). A change under
  `functions/` therefore also submits a new store version.
- After a deploy, the Artifact Registry repository for the functions needs a
  cleanup policy, and the CLI can fail the run after deploying without one. This project already
  has one. If it is ever missing, run
  `firebase functions:artifacts:setpolicy --location us-central1` once.

## Troubleshooting

- `iam.serviceAccounts.ActAs` on a service account: grant the deploy service
  account `roles/iam.serviceAccountUser` on that service account, as in the
  setup commands. The CLI checks both the compute and the App Engine default
  service account.
- Any other permission error naming a permission: grant the service account a
  role that contains it, then re-run the workflow from the Actions tab.
- The "Write function parameters" step fails: set the missing repository
  variable above, or remove a `#` or newline from its value.
- The `auth` step fails: check `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `FIREBASE_DEPLOY_SERVICE_ACCOUNT` and the `workloadIdentityUser` binding,
  which must match the `functions-production` environment subject.
- The job is rejected because the branch is not allowed to deploy to
  `functions-production`: start the run from `main`. The environment only
  allows `main`.
- The `auth` step fails with a permission or token-exchange error after the
  environment was added: the binding's subject does not match. Check that the
  binding names `functions-production` exactly, and that the job has
  `environment: functions-production`.
- The deploy passes but the environment has no branch rule: GitHub created the
  environment automatically because it did not exist. Add the rule under
  Settings, Environments, as described in Who can deploy.
- The deploy stops and asks to delete functions that are missing from the
  code: delete them by hand, as described above.
- The deploy fails on the `SMTP_PASSWORD` secret: confirm it has a version with
  `firebase functions:secrets:get SMTP_PASSWORD`, and that the deploy service
  account has the secret binding.
- The deploy fails about enabling retries: deploy that function by hand once, as
  in the first-run checklist.
