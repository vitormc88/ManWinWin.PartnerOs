# Knowledge Base and sector governance

Additive, user-authorized PROD delivery following UX audit P2. No document approval, archive, deletion, customer reclassification, permission assignments or source-record changes are performed on installation.

## Knowledge Base

73 active resources inventoried in 10 categories; 3 repeated filename groups (not proof of identical bytes). Original files/titles/categories/visibility preserved. Separate `documents.content_review` stores display title, confirmed language, product/subject, purpose, verified version label and editorial status. Initial state is needs_review. HQ queue flags duplicates, supports purpose/status filters and recoverable editorial archive. Source record title remains searchable.

Only an HQ admin with knowledge_base edit access can write a review; trigger checks this independently of the UI and records the real account/time. Recommended requires all fields. UI requires explicit human confirmation before recommending/archiving; no automatic approval from filenames/age. Source title, URL, filename or version changes invalidate a previous review. Replacing bytes at the same storage path requires incrementing document version; no byte hashing is claimed. Optimistic updated_at prevents silently overwriting a newer source/review.

Metadata is shared with already-authorized document readers under unchanged RLS. No new select grants or permission expansion. The page's Archive action now opens editorial review/confirmation instead of setting is_active=false; records removed before this release remain unchanged. Review history currently stores the latest reviewer/time, not a full historical approval ledger.

## Sectors

33 existing Explorer labels form v1 new choices. 9 legacy source labels accepted unchanged for compatibility, not silently mapped. Source of truth unchanged: partner Clients & Licenses / HQ directory / explicit Explorer override and source-change review. Shared component covers customer, lead, opportunity and prospect forms that already use SectorSelect. HQ directory picker and Excel/CSV validation use the same catalogue. DB guards cover clients, customer_explorer_hq and customer_explorer_overrides; free-text external lead/prospect integrations are not newly constrained by this migration. Tests enforce SQL/UI catalogue parity. Future catalogue additions require a versioned reviewed release; this is not an editable taxonomy-management system.

HQ can inspect labels and affected customers. Proposals only: Food & Beverages→Food & Beverage; Textiles→Textile. Packaging & Paper versus Plastics, Paper & Packaging, Other/Other Services and other legacy meanings require individual/factual review. No merge/mapping applied.

## Verification / release

Local isolated PostgreSQL fixture validates migration, authenticated non-HQ denial, module denial, required metadata, server-stamped actor/time, source-change invalidation, archive restoration, unknown-sector rejection across all three tables and grandfathered historical values. Frontend tests cover review cancellation/failure, human confirmation, filters, original-title preservation, catalogue parity, lead dropdowns and import validation. Provider preview must be READY, migration verified, then PROD release and HQ read-only browser checks. Real partner UX audit deferred by user.

## Recovery

UI rollback to previous deployment is safe with this additive schema. No data cleanup is required to roll back the interface. For an emergency catalogue-write compatibility issue, disable only the named guard_sector_catalogue triggers after reviewing the exact failure; never disable RLS. Do not drop content_review if reviews have since been saved: preserve/export them first. Previous UI commit c58e0854d1a773da5563671d49790942c88871ec.

Detailed Portuguese proposal and per-resource inventory delivered separately as PartnerOS-Propostas-Knowledge-Base-Setores-2026-10-15.md in the task workspace.
