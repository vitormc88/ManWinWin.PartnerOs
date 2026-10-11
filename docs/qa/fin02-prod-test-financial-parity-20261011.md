# FIN-02 — PROD vs TEST financial metadata parity (read-only)
**11 October 2026 · confirmed from the PROD Supabase connector and Lovable-connected TEST · NO DATA WRITES**

## Method and safe scope
- User explicitly authorized read-only technical metadata inspection of PROD.
- Verified connected PROD project `qownzparzsaeoyccgwuj` and TEST Lovable project `09e44188-ec64-4ec3-8add-b3b54882408c` (Supabase TEST ref `avxxzmoayxzrykwqzoqn`).
- Executed the same catalog-only SQL: `tests/sql/fin02/read_only_financial_baseline_inventory.sql`. Queries only pg_catalog, information_schema, pg_policies and pg_extension. No access to client rows, auth records, credentials or secret values.
- Used MD5 of SQL DDL for **drift detection only**, not as cryptographic authenticity proof.
- **No migrations/branches/backups/deployments in either live environment.**

## Top-level comparison
| Object class | PROD | TEST |
|---|---:|---:|
| Public tables | 102 | 107 |
| Public functions | 167 | 175 |
| RLS policies | 295 | 344 |
| Non-internal triggers | 91 | 94 |

Both run PostgreSQL 17; `pg_net` extension versions differ: PROD 0.20.3 vs TEST 0.20.0 (other sampled extensions match).

## Eight financial table structural parity
| Financial table | Columns PROD/TEST | Column signature equal? | RLS policy counts PROD/TEST | RLS definitions equal? | Trigger definitions equal? |
|---|---:|---|---:|---|---|
| `clients` | 40/40 | Yes | 4/5 | No | No (6 vs 5) |
| `contract_lines` | 18/18 | Yes | 2/2 | **Yes** | **Yes (2/2)** |
| `contracts` | 26/26 | Yes | 4/4 | No | **Yes (1/1)** |
| `deals` | 35/43 | **No** | 4/5 | No | No (4 vs 2) |
| `licenses` | 44/44 | Yes | 4/5 | No | No (2 vs 1) |
| `proposal_items` | 36/36 | Yes | 4/5 | No | No (2 vs 1) |
| `proposals` | 80/80 | Yes | 4/5 | No | No (6 vs 5) |
| `renewals` | 41/40 | **No** | 4/5 | No | **Yes (6/6)** |

- **6/8** financial table column signatures equal.
- **7/8** sampled financial-table constraint signatures equal; renewals differ (PROD has an extra superseded-by-previous-renewal foreign key).
- **1/8** sampled RLS policy signatures equal (`contract_lines`).
- **3/8** sampled table trigger sets equal (`contract_lines`, `contracts`, `renewals`).
- TEST has an additional `pg_probationary_denied` policy in six key tables, including clients/deals/licenses/proposals/proposal_items/renewals. Its effective restrictive/permissive behavior and access claims must be tested, not inferred just from its name.
- PROD has additional financial triggers absent from TEST: `enforce_proposal_item_discount_limits`, `enforce_proposal_discount_limits`, and `zz_deal_award_record_revenue`. These can change behavior, validation or financial accounting in PROD. Do not assume that an E2E passing in TEST reproduces PROD.
- TEST `deals` contains eight additional external-synchronization-related fields absent in PROD, including external IDs and source/sync metadata; `renewals` differs by one source/schema field (inspect exact effective schema before porting).

## Key financial function parity
| Function | Exact definition equal? | Grants equal? |
|---|---|---|
| `award_deal_proposal` | **Yes** | **Yes** |
| `close_renewal_core` | **Yes** | No |
| `close_renewal` | **Yes** | No |
| `contract_lines_refresh_total` | **Yes** | No |
| `proposal_contract_recurring` | **Yes** | No |
| `renewal_line_class` | **Yes** | No |
| `renewal_line_type_for` | **Yes** | No |
| `renewal_close_readiness` | **No** | No |

**7/8 code bodies identical; just 1/8 sampled execution grant sets identical.** TEST has special sandbox execution privileges on several routines, and some exposed helper grants differ. Compare behavior through role-constrained negative tests, not just body hashes.

### Semantically important `renewal_close_readiness` divergence
Read-only line comparison of the actual definitions showed:
- PROD's partner authorization checks `has_module_access('renewals','admin')`.
- TEST's partner authorization checks `has_role(_uid,'partner_admin')`.
- The corresponding denial messages differ.
This is an **authorization semantics divergence**, not a harmless formatting difference. No declaration that one should overwrite the other without business/security review.

## Consequence for Lab B
**Go as a starting scaffold; NO-GO as a byte-identical clone of TEST.**
- A *new, approved schema-only PROD snapshot* can eliminate the Academy application-data replay problem; no Academy course rows need to be copied.
- For legitimate TEST FIN02 Gate-2 claims, reconcile specific extra TEST `deals` and `renewals` schema, RLS policies and grants, readyness function, while preserving all existing transactional dependencies. The snapshot is NOT yet a full schema dump or executable restore.
- Separately run true PROD-behavior tests for extra discount-limit and revenue triggers in a **private isolated** clone. No direct PROD live tests and no automatic sync across environments.
- Important to confirm if TEST-only `pg_probationary_denied` is restrictive; do not assume a same-named policy performs as intended.
- Keep GitHub Lab A automatic (PR #34 tested twice on disposable PostgreSQL 17, net/gross/discount renewal/provenance/tamper regressions) while constructing Lab B.
- **No live TEST/PROD data should be exported to public GitHub; no raw function/policy definition should be committed without a code and secrets review.**
- The Supabase plugin currently has a read-only SQL metadata path, but **not a remote `pg_dump` download**. An approved source schema export or audited selective DDL extraction is needed before the original RPCs can be run on a privately isolated cluster.
- STOP if complete RLS/grant parity, original functions, and rollback/idempotency cannot be proven. Full Gate-2 **NOT PASSED**.

## Actionable roadmap
1. Prepare/test a strictly **financial-scope** schema bootstrap from a schema-only approved baseline (not the entire historical application migration ledger).
2. Validate structural & security overlays against TEST catalog signatures; record each consciously accepted difference.
3. Apply PR #34 in ephemeral compatible PostgreSQL/Supabase environment.
4. Run original award/renewal functions and role-specific concurrent/rollback tests with synthetic records.
5. Certify Gate-2 only with passing role+transaction evidence, then seek explicit TEST deploy approval. PROD deploy separately authorized.

Status: **PROD/TEST metadata comparison COMPLETE; Lab A SQL Gate-1 PASS; Lab B real-schema restore and full E2E PENDING.**
