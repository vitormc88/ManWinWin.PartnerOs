# Partner Academy — hardening verification (SQL)

Run these against the **target environment's** database (never assume the test
project reflects production). Each query states the expected result.

## 1. Learner cannot write progress directly

Direct writes to progress tables must be denied for `authenticated`; only the
`SECURITY DEFINER` RPCs may write.

```sql
-- Expect: no INSERT/UPDATE/DELETE rows for authenticated on progress tables.
select grantee, privilege_type, table_name
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('academy_mission_progress', 'academy_module_progress')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

```sql
-- Executed as a signed-in learner. Expect: permission denied / RLS violation.
insert into public.academy_module_progress (user_id, module_id, status, progress_pct)
values (auth.uid(), '<module-uuid>', 'certified', 100);

update public.academy_module_progress
   set progress_pct = 100, status = 'certified'
 where user_id = auth.uid();
```

## 2. Progress is server-computed and cannot be forged

```sql
-- Expect: one row; progress_pct recomputed from published required missions,
-- status never 'certified' unless the server certification flow set it.
select * from public.academy_complete_mission('<mission-uuid>', true);

select module_id, status, progress_pct
from public.academy_module_progress
where user_id = auth.uid() and module_id = '<module-uuid>';
```

```sql
-- Locked mission whose prerequisite is incomplete. Expect: exception.
select * from public.academy_complete_mission('<locked-mission-uuid>', true);
```

## 3. Checklist state is user-scoped and relationship-validated

```sql
-- Expect: only the caller's rows are visible.
select user_id, mission_id from public.academy_mission_progress;

-- Expect: exception for a mission that is not published/visible to the caller.
select public.academy_set_checklist_state('<foreign-mission-uuid>', '{"a":true}'::jsonb);
```

## 4. Visibility follows the publication chain

```sql
-- Expect: no mission rows whose module or phase is not published
-- (evaluated as a non-admin learner).
select m.id, m.status, mo.status as module_status, p.status as phase_status
from public.academy_missions m
join public.academy_modules mo on mo.id = m.module_id
left join public.academy_phases p on p.id = mo.phase_id
where mo.status <> 'published' or coalesce(p.status, 'published') <> 'published';
```

## 5. Resource model integrity

```sql
-- Expect: resource_type constraint allows exactly the seven supported types.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.academy_resources'::regclass
  and conname like '%resource_type%';

-- Expect: zero orphans — every mission-scoped resource resolves through its module.
select r.id
from public.academy_resources r
join public.academy_missions m on m.id = r.mission_id
where r.module_id is distinct from m.module_id;
```

## 6. Ordering integrity

```sql
-- Expect: swap is atomic and admin-only; a non-admin call raises.
select public.academy_swap_sort_order('missions', '<uuid-a>', '<uuid-b>');

-- Expect: no negative ordering or durations anywhere.
select 'missions' as t, count(*) from public.academy_missions
  where sort_order < 0 or coalesce(estimated_duration_minutes, 0) < 0
union all
select 'modules', count(*) from public.academy_modules
  where sort_order < 0 or coalesce(estimated_duration_minutes, 0) < 0;
```

## 7. Attachments stay private

```sql
-- Expect: training-assets is NOT public.
select id, public from storage.buckets where id = 'training-assets';

-- Expect: write policies on the academy/ prefix are restricted to Academy admins.
select polname, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname ilike '%academy%';
```

The frontend never builds a public storage URL for Academy files: it stores the
object path and resolves it via `signFileUrl('training-assets', path)`.

---

# Final hardening pass — additional verification

## A. Function EXECUTE grants (least privilege)

```sql
-- Expect: academy_module_progress_pct → service_role only (no anon/authenticated/PUBLIC).
--         academy_complete_mission / academy_set_checklist_state /
--         academy_swap_sort_order / academy_update_record / can_access_academy /
--         is_academy_admin → authenticated only.
select p.proname,
       coalesce(array_to_string(p.proacl, ', '), 'owner-only') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('academy_module_progress_pct','academy_complete_mission',
                    'academy_set_checklist_state','academy_swap_sort_order',
                    'academy_update_record','can_access_academy','is_academy_admin')
order by p.proname;
```

```sql
-- Executed as a signed-in learner. Expect: permission denied for function.
select public.academy_module_progress_pct(auth.uid(), '<module-uuid>');
```

## B. Academy permission denial (authenticated user without 'onboarding' access)

```sql
-- Expect: false for a user with no effective view/admin on module key 'onboarding'.
select public.can_access_academy();

-- Expect: 0 rows for that user, even though published content exists.
select count(*) from public.academy_modules;
select count(*) from public.academy_missions;
select count(*) from public.academy_resources;

-- Expect: ERROR "You do not have access to the Partner Academy".
select * from public.academy_complete_mission('<mission-uuid>', true);
select public.academy_set_checklist_state('<mission-uuid>', '{}'::jsonb);
```

An HQ admin (or a user with admin on `onboarding`) must still see draft and
published content and be able to write.

## C. Optimistic concurrency (no silent overwrite)

```sql
-- As an Academy admin. Expect: success, returns the new updated_at.
select public.academy_update_record(
  'academy_missions', '<mission-uuid>',
  jsonb_build_object('title', 'New title'),
  (select updated_at from public.academy_missions where id = '<mission-uuid>')
);

-- Expect: ERROR containing ACADEMY_CONFLICT (stale expected timestamp).
select public.academy_update_record(
  'academy_missions', '<mission-uuid>',
  jsonb_build_object('title', 'Conflicting title'),
  now() - interval '1 day'
);

-- Expect: ERROR "Only Academy admins can edit content" for a non-admin caller.
```

The editor surfaces the conflict, keeps the local draft and refetches the
record; it never re-sends the write.

## D. Attachment MIME/extension enforcement

```sql
-- Expect: the academy insert/update policies include the extension whitelist.
select policyname, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('academy_assets_admin_insert','academy_assets_admin_update');
```

Client-side, `validateAcademyUpload` rejects a disallowed extension, a MIME type
that does not match the extension, and anything above 100 MB. Storage-side, an
upload such as `academy/payload.exe` is rejected by the policy even with a valid
admin session, and non-`academy/` prefixes remain denied.

**Known limitation:** the bucket-level `allowed_mime_types` column on
`storage.buckets` cannot be set from this environment (writes to
`storage.buckets` are blocked and the bucket tool only toggles public/private).
Server-side type enforcement is therefore done in the storage RLS policy by
extension whitelist, not by bucket MIME configuration. The existing 100 MB
bucket limit is unchanged.

## E. Orphan prevention on attachment replacement

```sql
-- Expect: 0 — no other resource references the replaced path before deletion.
select count(*) from public.academy_resources
where file_path = '<old-academy-path>' and id <> '<resource-uuid>';
```

The editor only deletes a replaced attachment **after** the record save
succeeds, only when the value is a private path under `academy/`
(`isDeletableAcademyObjectPath`), and only when the reference count above is 0.
Otherwise it keeps the object and reports the reason; it never deletes external
URLs or non-Academy paths.

## F. Deletion scope

Hard deletion is offered for `draft` records only. `published` and `archived`
records cannot be deleted from the editor (`canHardDelete`).
