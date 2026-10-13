# PartnerOS R1 — PRODUCTION release containment and PR #50 review (13 Oct 2026)

**Status:** proposals and CI are staged on Draft PR #50; PROD project settings NOT changed; PR #50 NOT merged; no PROD database changes.

## Live source topology, objectively confirmed

- GitHub repository `vitormc88/ManWinWin.PartnerOs`, live deployment branch `main`; Lovable's project 09e44188-ec64-4ec3-8add-b3b54882408c is linked to `main` and may push code when an agent creates a migration.
- FIN02 TEST SEC35/SEC36/SEC38 were installed and TEST history reconciled; the Lovable agent also merged unrequested Drizzle and dependency scaffold into `main` as `cd84cd518fd26dd53d1bd22f9337770b036c1d8e`, which automatically published to PROD. A user-approved Vercel rollback temporarily restored PROD to `b1a8998b518d4a8d67ed6f7afac9c791146cafb3`.
- **Later legitimate parallel development:** PR #49 was merged to main as `87a0cbca1a99bbe0cdb3dfd16c94a7ffe79e6fed`, introducing the approved PartnerOS brand loading animation. Vercel auto-published that commit: the production domain was independently observed pointing to deployment `dpl_HdpaaYF78fQ9wp3n2jBrR1qk7XuW`. This subsequent deployment includes the unrequested Lovable scaffold in the Git ancestry. Do not roll back PR #49 without authorization.
- Draft PR #50 restores all 12 unrequested source and package paths to exactly the pre-unplanned tree, while adding QA-only TEST journal reconciliation documentation/scripts. It has **not** been merged, and the actual TEST schema and native Drizzle DB history remain installed.
- GitHub API has reported PR50 `mergeable=true` against main after PR #49. The final candidate merge must preserve the six PR49 brand, authentication loading and route files: `src/components/BrandLoadingMark.css`, `src/components/BrandLoadingMark.tsx`, `src/components/BrandMark.test.tsx`, `src/components/BrandMark.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/Auth.tsx`.

## Immediate operational containment — requires a separate authorized change

**Option A: simple reversible temporary stop for automatic PROD builds (recommended until R1 gates pass).**

Vercel Project `partner-nexus-hub-90` → Settings → Build and Deployment → **Ignored Build Step**. A project-level command can skip production builds and keep previews enabled, using `VERCEL_ENV`. **Exit code 0 means SKIP the deployment; exit code 1 means allow the build**. Candidate command (must be reviewed before use):

```sh
if [ "$VERCEL_ENV" = "production" ]; then echo "PROD automatic deployment paused pending R1 release approval"; exit 0; else exit 1; fi
```

This intentionally stops automatic PROD builds from further `main` pushes, while preview builds keep working. It does **not** stop commits to `main`; does **not** rewrite live PROD database; does **not** remove a currently serving deployment; does **not** replace PR review. Re-enable with a separately approved controlled release, after exact commit and database compatibility review. Record the project's original ignored-build command before making any change; never overwrite pre-existing behavior blindly. User approval is required to change this Vercel project setting. Do not silently deploy the settings change.

**Option B: durable reviewed release process.** Require pull requests and named reviewers for `main` using a GitHub repository ruleset / branch protection (GitHub admins must approve; Lovable direct main edits should no longer bypass it). Add Vercel Deployment Checks to block automatic promotion until an approved manual release check passes; verify features supported by the project/plan, and do not add any paid services without consent. Run CI in feature-branch previews; publish reviewed production-environment builds only after manual approval.

Vercel official references:
- https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel — `0` skip, `1` build
- https://vercel.com/docs/project-configuration/git-configuration — `git.deploymentEnabled`, alternative branch-level deployment suppression
- https://vercel.com/docs/deployment-checks — block promotion until checks pass

**Do not confuse** Vercel Deployment Protection (password/SSO on URLs) with prevention of production deployments: that is not the same release gate.

## PR #50 candidate gates

1. Run `.github/workflows/r1-prod-source-cleanup-qa.yml` (CI-only: no database secrets or app deploy). It validates that the synthesized PR merge tree retains PR49 source files, eliminates Lovable Drizzle app scaffolding, and builds/types-checks with brand regression tests.
2. Verify preview READY and that `main` did not advance after review. Compare expected policy changes (none), brand changes retained, and source diff limited to the 12 Lovable paths plus QA-only assets.
3. Verify **TEST** read-only `tests/sql/fin02/fin02_test_dual_journal_postflight.sql` returns all true. Five FIN02 source versions present; three Drizzle entries and installed 11 policies unchanged.
4. Activate temporary Vercel build halt only with permission, independently inspect it, and then request **separate explicit approval** for PR #50 merge; the merge can affect PROD deployments.
5. Do not rerun original SEC35/SEC36/SEC38 SQL. PR50 reverting Drizzle application files does not undo TEST's Drizzle DB journal. Before any future Lovable native schema change, establish the source-of-truth migration owner and journal strategy.
6. Separate, real signed-JWT/browser QA and the rest of R1 FIN/OPS/UX/MEM gates remain pending before any FIN02 PROD database release.

This doc is a release decision record, **not** evidence that a PROD guard has already been enabled.
