# Qualification Module Certification

## 1. Inspection summary

Module 5 — Qualification exists with 11 published items, in this order: Module Introduction (intro), Missions 1-6 (mission), Practical Exercise (exercise, currently optional and sequentially gated), Module Summary (summary), Qualification Checklist (checklist, optional), Module Certification (certification, optional, gated).

Current state:
- The certification item is just a normal Academy content page with no engine behind it.
- Progress is tracked in `academy_mission_progress` and `academy_module_progress`, written only by the server functions `academy_complete_mission` and `academy_set_checklist_state`.
- Module progress percentage already excludes certification items.
- Module status vocabulary already includes `ready_for_certification`, `certification_failed` and `certified`, but nothing ever sets them.
- Academy access is gated by `can_access_academy()`; admin writes by `is_academy_admin()`.
- No question bank, attempt or certification tables exist yet.
- The admin area (`/onboarding/admin`) is a single page with per-entity tabs, split-view editing, publication validation and safe delete.

## 2. Implementation plan

### Database (migrations, additive)

New private tables:
- `academy_questions` — the question bank, with all fields listed in the brief (code, category, difficulty, type, text, scenario, options, correct answer, explanation, tags, weight, mandatory flag, status, version).
- `academy_attempts` — one row per certification attempt, with the generated question ids, timestamps, expiry, scores by category and the next eligible attempt time.
- `academy_attempt_answers` — one row per answered question, with correctness and awarded score.
- `academy_certifications` — issued certification records.

Access model:
- No client read access at all to `academy_questions` or `academy_attempt_answers` for partners; admins can manage the bank.
- Attempts and certifications are readable by their owner and by Academy Admins; never writable from the client.
- All learner interaction goes through server functions: `academy_cert_eligibility`, `academy_cert_start`, `academy_cert_state` (returns the sanitised active exam: question text and options only, no answers), `academy_cert_answer`, `academy_cert_submit`.
- Scoring, blueprint enforcement, timing, retake windows and certification issuance happen entirely inside those functions.

### Exam engine (server-side)

- Blueprint per attempt: 2 knowledge, 4 understanding, 5 application, 6 scenario analysis, 3 advanced/record review — 20 questions.
- Additional constraints enforced by the selector: at least 1 TIMD, 1 T-FORM, 2 qualify/nurture/disqualify scenarios, 2 PartnerOS execution, 1 multiple-select, 1 ordering/classification, 6 hard/expert, and at most 2 near-duplicate scenarios (by scenario tag).
- Randomised selection and question order, plus per-attempt option shuffling (never for ordering questions).
- The previous attempt's question set is avoided as a whole; identical consecutive sets are rejected and reselected.
- Scoring uses stored weights, all-or-nothing for multi-select/ordering/classification, and computes raw count, weighted percentage, per-category scores and the scenario analysis percentage. Pass = weighted >= 80% and scenario >= 60%.
- Retake windows: 24h, 72h, then 7 days, stored on the attempt and re-verified on every start.

### Eligibility and module status

- Certification unlocks when the authenticated user has completed the intro, missions 1-6, the Practical Exercise and the Module Summary. The Qualification Checklist never blocks.
- The Practical Exercise is made a required, countable item so it participates in progress and eligibility (learning content untouched).
- On all required items complete, module status becomes `ready_for_certification`; on pass it becomes `certified` and a certification record is issued (one valid record per user/module/version); on fail it becomes `certification_failed`.

### Frontend

- `src/lib/academy-certification.ts` — pure domain helpers (eligibility label, button state, timer formatting, weak-area mapping) with unit tests.
- `src/hooks/useAcademyCertification.ts` — queries and mutations against the server functions.
- The existing Module Certification page gains a prominent state-aware button: Locked / Start / Resume / Retake available on <date> / Passed.
- `src/pages/academy/AcademyCertificationExam.tsx` — timed, one-question-at-a-time runner: server-driven remaining time, autosave on confirm, no backward navigation, pre-start warning, auto-submit on expiry, refresh-safe resume.
- `src/pages/academy/AcademyCertificationResult.tsx` — passed and failed views with score breakdown, category performance, weak topics, recommended missions, attempt number and next eligible time. No answers or bank content revealed.
- Admin: a new Questions tab in the existing Academy admin page with create / edit / archive / preview and filters by module, mission, category, difficulty, type, status plus code/text search.

### QA data

A small, clearly-marked test question set (`QA-*` codes) is inserted so the engine can be validated. The approved 60-question bank is inserted afterwards.

## 3. Verification

Focused unit tests for blueprint validation, scoring and retake maths, the full suite, typecheck and production build, plus a manual QA checklist and SQL verification notes covering: no partner access to answers, timer non-resettable by refresh, single active attempt, server-enforced retake windows, and unchanged Module 5 content.
