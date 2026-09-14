# Proposal document-quality hardening

## Scope
Improve only the existing Professional and Business proposal DOCX generators and the browser print/PDF template. Preserve proposal content, values, discounts, rules, permissions, and workflow.

## Implementation
- Create small shared document-control helpers for safe filenames, consistent titles/version labels, and structured payment-term lines.
- Align DOCX and PDF hierarchy: compact cover/identity block, configuration, investment summary, terms, support information, and institutional footer.
- Harden pagination:
  - PDF print CSS: repeating table headers, unsplittable rows and totals, heading-to-content keeps, grouped summary blocks, fixed footer area.
  - DOCX: keep headings with following content, repeat table headers, prevent row splitting, keep subtotal groups and related totals together.
- Make running headers resilient to long client/project names and add consistent version/date/restricted information.
- Strengthen total-row contrast and selected Business-option labeling without changing calculations.
- Render billing conditions as readable structured items rather than embedded bullet symbols.
- Add document properties and page-number footers matching filename, visible version, client, and title.

## Verification
- Add focused structural tests for metadata/version parity, safe filenames, repeated headers, row-splitting controls, keep rules, and print CSS.
- Generate three representative outputs: simple Professional, long-name/long-table Professional, and long Business comparison.
- Convert every DOCX and PDF page to images and inspect all pages for clipping, overlaps, orphan headings, broken continuations, isolated totals, footer placement, and excessive blank pages.
- Compare extracted values and discounts before/after, then run the full automated test suite, TypeScript check, and production build locally only.

## Constraints
No database access or writes, production deployment, pricing/business-rule changes, or unrelated refactors.
