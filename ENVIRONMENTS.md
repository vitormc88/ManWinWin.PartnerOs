# PartnerOS — Environment Runbook

## Matrix

| Environment | Host(s) | Supabase project ref | Config source |
| --- | --- | --- | --- |
| Production | `partneros.manwinwin.com` | `qownzparzsaeoyccgwuj` | Vercel Production env vars |
| Test / Preview | `*.lovable.app`, `*.lovableproject.com`, `localhost` | `avxxzmoayxzrykwqzoqn` | committed `.env` |

Production and preview never share a database. Preview data is dummy data.

## Vercel variables (Production scope)

- `VITE_SUPABASE_URL = https://qownzparzsaeoyccgwuj.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY = <prod publishable/anon key>`
- `VITE_SUPABASE_PROJECT_ID = qownzparzsaeoyccgwuj`

No `service_role` key or other secret belongs in any `VITE_*` variable — those are
compiled into the browser bundle.

## Fail-closed guard

`src/lib/supabase-env.ts` resolves and validates the environment before
`createClient` runs in `src/integrations/supabase/client.ts`:

- production host must resolve to `qownzparzsaeoyccgwuj`;
- preview/localhost hosts must resolve to `avxxzmoayxzrykwqzoqn`;
- when the publishable key is a legacy JWT, its `ref` claim must match the URL ref;
- missing or malformed values throw a configuration error. Keys are never logged.

## Verification checklist

1. `bunx vitest run src/lib/__tests__/supabase-env.test.ts` — all green.
2. Preview loads and the network tab shows requests to `avxxzmoayxzrykwqzoqn.supabase.co`.
3. On `partneros.manwinwin.com`, requests go to `qownzparzsaeoyccgwuj.supabase.co`.
4. `.env` contains only TEST `VITE_*` values and no non-`VITE_` keys.
5. `supabase/config.toml` still pins `project_id = "avxxzmoayxzrykwqzoqn"` (CLI/local only).
6. After any Lovable commit, re-confirm Vercel Production variables were not overwritten.

## Warning

Lovable's database/migration tooling is connected to the **TEST** project
(`avxxzmoayxzrykwqzoqn`) only. Never infer production state from it, and never
run migrations, seeds or backfills against it when the request concerns
production. Production changes must target `qownzparzsaeoyccgwuj` explicitly and
be validated independently.
