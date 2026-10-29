# Firebase Functions Deployment

Every push to `main` that changes `functions/**`, `firebase.json` or
`.github/workflows/deploy-functions.yml` triggers that workflow, which deploys
the Cloud Functions to the `sticky-notes-chrome-extension` Firebase project.
Note that a `firebase.json` change, such as new hosting headers, also redeploys
the functions. Pull requests that only change the extension, the site or the
docs do not deploy.

Because the workflow file itself is in the path filter, merging the pull
request that adds or edits it also deploys. Finish the first-run checklist
below before merging that pull request.

## First-run checklist

1. Create the deploy service account and its bindings (Google Cloud setup).
2. Make sure the secret exists and has a version:
   `firebase functions:secrets:set SMTP_PASSWORD` (for Gmail, use an
   [app password](https://myaccount.google.com/apppasswords)).
3. Set the four repository variables listed below.
4. Deploy any event function that uses `retry: true` by hand once, with
   `firebase deploy --only functions`. A non-interactive deploy can refuse
   to enable a retry policy for the first time unless it is forced, and forcing
   it would also delete functions that are missing from the code. `sendMail` is the
   only such function today.
5. Merge. The first run is the real test of the setup.

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

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountUser \
  --project "$PROJECT"

# Let the deploy bind the SMTP secret to the function
gcloud secrets add-iam-policy-binding SMTP_PASSWORD \
  --member "serviceAccount:${SA}" --role roles/secretmanager.admin \
  --project "$PROJECT"

# Let this repository impersonate the deploy service account. The pool is in
# the shortcuts-for-messages project (number 624640566757, pool
# github-actions, provider sticky-notes), shared with Chrome Web Store
# publishing. A pool can impersonate a service account in another project.
# The provider is restricted to this repository and maps attribute.repository.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role roles/iam.workloadIdentityUser --project "$PROJECT" \
  --member "principalSet://iam.googleapis.com/projects/624640566757/locations/global/workloadIdentityPools/github-actions/attribute.repository/ravidorr/sticky-notes-chrome-extension"
```

If `gcloud` has a different active account or default project, add
`--account` and `--project` to every command so nothing runs against the wrong
project.

The role list is a starting point. The Firebase CLI may need other permissions
over time, so read the first run's error, which names any missing permission,
and trim the roles after a successful deploy.

## Who can deploy

The provider and the binding above trust the whole repository, not only
`main`. The job's branch condition stops the deploy workflow from running for
other branches, but any workflow file on any pushed branch that requests
`id-token: write` could still impersonate the deploy service account. Fork pull
requests do not receive an OIDC token, so the exposure is anyone or anything
with push access to this repository. The Chrome Web Store publisher shares the
same pool and has the same property.

To tie the deploy identity to `main`, use a GitHub environment:

1. Create an environment with a deployment branch rule that allows only
   `main`:

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

2. Add `environment: functions-production` to the job in the workflow.
3. Bind the service account to that environment's subject, and then remove
   the repository-wide binding from the previous section:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --role roles/iam.workloadIdentityUser --project "$PROJECT" \
     --member "principal://iam.googleapis.com/projects/624640566757/locations/global/workloadIdentityPools/github-actions/subject/repo:ravidorr/sticky-notes-chrome-extension:environment:functions-production"
   gcloud iam service-accounts remove-iam-policy-binding "$SA" \
     --role roles/iam.workloadIdentityUser --project "$PROJECT" \
     --member "principalSet://iam.googleapis.com/projects/624640566757/locations/global/workloadIdentityPools/github-actions/attribute.repository/ravidorr/sticky-notes-chrome-extension"
   ```

   This relies on the provider mapping `google.subject` to `assertion.sub`,
   which it does today.

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
  versions in the test workflow. The deploy job follows `engines.node`.
- Every pull request bumps the version, and the Chrome Web Store workflow
  publishes on every merge, as described in
  [Chrome Web Store Publishing](CHROME_WEB_STORE_PUBLISHING.md). A change under
  `functions/` therefore also submits a new store version.
- After a deploy, the Artifact Registry repository for the functions needs a
  cleanup policy, and the CLI can fail the run after deploying without one. This project already
  has one. If it is ever missing, run
  `firebase functions:artifacts:setpolicy --location us-central1` once.

## Troubleshooting

- A permission error naming a permission: grant the service account a role that
  contains it, then re-run the workflow from the Actions tab.
- The "Write function parameters" step fails: set the missing repository
  variable above, or remove a `#` or newline from its value.
- The `auth` step fails: check `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `FIREBASE_DEPLOY_SERVICE_ACCOUNT` and the `workloadIdentityUser` binding.
- The deploy stops and asks to delete functions that are missing from the
  code: delete them by hand, as described above.
- The deploy fails on the `SMTP_PASSWORD` secret: confirm it has a version with
  `firebase functions:secrets:get SMTP_PASSWORD`, and that the deploy service
  account has the secret binding.
- The deploy fails about enabling retries: deploy that function by hand once, as
  in the first-run checklist.
