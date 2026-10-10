# Reviewed company websites — 10 October 2026

The source of truth is `public.customer_explorer_media`, keyed to the canonical Client ID. No customer list or website catalogue is embedded in the public frontend bundle.

Website URL, public identity evidence and review date are added together. Existing media RLS, rollout gates, Settings and user management remain unchanged. Only authorized HQ editors can write. Customer cards and PDF export consume the same reviewed fields. HQ can correct or unlink a website in the existing media editor.

Only HTTPS public domain URLs are accepted; credentials, IP/local URLs, whitespace/backslash URLs, missing evidence and future review dates are rejected. No credentials or personal customer contacts are collected.

Research uses previously reviewed official logo/identity sources, refreshed public pages, and a bounded additional review. Name, country and activity are reconciled before import; supplied directory values are not changed. Group websites are used only for corroborated entities. The 80% identity criterion is an operational confidence threshold, not a measured probability.

## Verified batch

- 444 directory records, including 415 visible non-historical customers.
- 171 reviewed websites imported, covering 163 visible non-historical customers and 8 historical customers.
- Every existing logo association, dark-background choice and case study preserved.
- Remaining customers are unresearched or unresolved; absence is not evidence that no website exists.
- Additional logo assets for GEA, ASA and Lavajet are prepared and visually inspected separately; uploads are verified independently, not counted as published merely because a file exists.

Research and pre-import media snapshots remain in the ignored local `.customer-explorer-preview` audit folder. No full directory export is committed to the repository.

## Validation and deployment

Migration tested in TEST with the existing HQ role. Transactional suite rolls back all test writes and checks HQ save/unlink, rejection of unsafe URLs/missing evidence/future dates, denial of partner writes and anonymous reads. No rollout or account permissions changed. Frontend tests cover safe links, missing metadata, HQ save/unlink payloads and existing PDF/access/settings controls. Typecheck and build pass.

Deploy the additive migration before the frontend. Rollback the frontend commit if necessary; nullable columns are compatible with the prior frontend and may safely remain. Do not drop researched metadata during routine rollback. Restore individual field values from the audited pre-import snapshot if a reviewed association is wrong.
