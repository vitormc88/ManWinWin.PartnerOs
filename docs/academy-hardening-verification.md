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
