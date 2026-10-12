# PartnerOS R1 Gate6C — Lean validation instead of rebuilding the current pricing engine
**12 Oct 2026 · Audit + genuine Deno execution PASS · full faithful TEST clone/authenticated API NOT EXECUTED · NO TEST/PROD changes**

## Scope reset following product-owner feedback
The owner correctly challenged excessive gates/prototypes. This gate is NOT another pricing-engine redesign. The decision is to **preserve the existing Business engine**, identify only factual differences between environments, and test the minimum boundary between a correctly priced proposal and a safe financial award/renewal. A large new catalog engine, broad DB migrations, live Edge deployment or new product workflow are NOT recommended now.

## Source comparison with actual repository main
- `src/lib/proposal-business-engine.ts` on `main` versus Draft PR #34 has **identical business formulas**, one import path changed to allow shared Deno TypeScript resolution.
- `src/lib/proposal-discount-policy.ts` is **byte-identical** in both. This disproves the idea that our PR needed to correct fundamental pricing/discount formulas; it does not prove all live data paths are bug-free.
- The previous FIN01/FIN02 work remains valuable for the *save→award→contract→renewal* boundary; see initial sale/discount/rollback tests. But no more general Business pricing redesign is justified without concrete negative evidence.

## PROD and TEST metadata — READ-ONLY, no customer data
Queries in PROD Supabase `qownzparzsaeoyccgwuj` and Lovable TEST `avxxzmoayxzrykwqzoqn` on 12 Oct show:
- BOTH have **38 active Business pricing rules**, 38 unique codes. The **sets of rule codes**, **unit prices**, **support percentages** and **currencies** match exactly under sorted aggregate comparison. This is strong positive evidence of catalog monetary parity (not complete calculation-path parity).
- Exactly two **can_override** flags differ: `BUS_KEEPIT_SAT` and `BUS_USEIT_SAT` are **true in PROD**, **false in TEST**. Business owner must decide whether this is intended, especially because KeepIT S&TA must calculate on the gross license base. Do not silently copy values between environments.
- **PROD** has `public.partner_discount_limits` and two **enabled** before-INSERT/UPDATE triggers: `enforce_proposal_discount_limits` on `public.proposals`, `enforce_proposal_item_discount_limits` on `public.proposal_items`. Backed by corresponding functions in `private`, and a `private.current_proposal_discount_limits()` role-aware resolver.
- **TEST** lacks `public.partner_discount_limits` and the corresponding two discount enforcement triggers/functions. Earlier checks sought DIFFERENT proposed trigger/function names from migrations_review, which incorrectly suggested PROD might not have these protections. **This report corrects that assumption**.
- PROD resolver enforces confirmed HQ 100/100, partner default software 10%, service 10% except implementer 100%, partner-specific override including 0; item guard validates percentage/fixed amounts and gross base. The triggers have explicit `auth.uid() IS NULL` escape for privileged/non-user operations; this is a trust-boundary to audit if a service role writes proposals, **not proof of an exploitable incident**.
- No production code or schema modifications were carried out. These queries only read PG catalog/SQL function definitions and aggregated pricing metadata; NO client rows, pricing values, secrets or backup contents were uploaded to GitHub.

## Actual Deno compatibility test — source engine UNCHANGED
- Added **one isolated test file**: [tests/deno/fin02-gate6c-original-business-runtime_test.ts](../../tests/deno/fin02-gate6c-original-business-runtime_test.ts). Installs Deno 2 in GitHub Actions and calls the existing full Business engine shared with the pure quote preview. Exercises complex KeepIT/UseIT pricing and renewals, rejects a 15% reseller discount against a 10% cap, rejects missing essential price source. NO database/Docker/network/service credentials.
- Initial CI failure was a TEST ASSERTION reading a structured exception code from human-readable message. Fixed assertion to inspect the `code` field. It was not a pricing defect.
- [Actual Deno + UI TypeScript and all 13 GitHub Actions at 7275547c4ff98e8c4c588dfa77c8174d8efbe1d1](https://github.com/vitormc88/ManWinWin.PartnerOs/actions/runs/38277248191): **SUCCESS**, 3/3 Deno cases. Existing financial role, isolated award, two renewals and rollback jobs remain green.
- Original private TEST PG custom backup file exists locally, but NO faithful complete TEST Supabase Auth/extension/trigger full restore or signed HTTP test has been performed. Do NOT claim Gate6C full clone complete based on synthetics.

## Minimal next release decisions — stop creating parallel prototypes
1. **One-page intended pricing behavior signoff**: confirm if S&TA override should be true in PROD and false in TEST, and whether discount caps/overrides are current accepted rules. This is a **business configuration decision**, not a request to rework formulas.
2. **One reversible TEST-parity plan**: precisely inventory and selectively stage TEST equivalents of EXISTING PROD partner limits + two discount triggers/functions in private faithful isolated TEST clone. Do not invent differently named replacements or copy PROD data. Check signed HQ / reseller / implementer JWTs, override 0/15% denial, and privileged actor-null writes. A complete original TEST role/trigger restore (#39) remains a gate; the private backup was never published to CI.
3. **One single accepted-purchase smoke**: through real TEST app, a representative Business quote with 3% temporary/recurring Web discount → saved proposal → reviewed selected award → first renewal 2027 → next 2028, with one negative cross-role/late rollback. This verifies where our existing source logic may actually fail, rather than adding product surfaces from synthetic what-ifs.
4. Only if smoke tests fail, prepare a **minimal independent patch** addressing exactly the observed break (FIN01 header/item atomicity, FIN02 per-line source protection, or FIN03 document version). Other PR #34 and #32 candidates stay Draft and must undergo consolidation before merge; no full-feature wholesale install of accumulated lab prototypes.

## R1 status after Gate6C
| Stream | Proven | Not proven |
|---|---|---|
| F0 + Business pricing | Existing main engine unchanged; 38 same effective base pricing codes/amounts; Deno runs original formulas | Complete accepted source-to-DB-to-doc E2E |
| FIN01 save | Synthetic atomic write, role/rollback tests | Live authenticated TEST app save/missing discount triggers |
| FIN02 award/renewal | Source-backed synthetic 2026/27/28 financial integrity/discount test | Production identity/privileged actor/RLS and historical pricing |
| FIN03 official docs | Fake-byte append-only ledger lab | Real immutable DOCX/PDF Storage and downloads |
| QA01 Thai Union | Synthetic acceptance steps | One actual approved TEST full journey without manual database repairs |
| OPS01/MEM01/UX01 | Distinct ongoing original workstreams | Their own acceptance and rollout |

**Gate6C Deno runtime / PROD-TEST read-only factual audit = PASS. Faithful cloned TEST Auth/JWT execution = STILL OPEN. Release to TEST/PROD = NO-GO.**

**Product direction: stop re-engineering a working pricing engine. Close verified TEST-vs-PROD configuration/authorization differences and exercise the real business flow.**
