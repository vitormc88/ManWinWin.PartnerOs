# Email integration assessment (read-only) and options

Nothing has been changed. This is a summary of what was found and the options for a decision.

## Findings

1. **Sender domain actually set up**
   - The verified sending subdomain is `notify.partneros.manwinwin.com`, which belongs to `partneros.manwinwin.com`.
   - It is handed over to Lovable's name servers (ns5/ns6.lovable.cloud), and the status is Verified.
   - The code uses `SENDER_DOMAIN = notify.partneros.manwinwin.com` and `FROM_DOMAIN = partneros.manwinwin.com`, so the From address is `ManWinWin PartnerOS <noreply@partneros.manwinwin.com>`.
   - There is no second, differently spelled domain in this workspace's setup.

2. **The Lovable email key is tied to this project.** Lovable creates it automatically for this Lovable project and its workspace. It is meant to be used only by this project's own backend functions.
   - No official setting or tool exists to issue, export or bind a managed email key to an outside backend, such as your own production database.
   - The documentation says the key must never be set by hand. The self-hosting guide doesn't cover managed email.
   - The "invalid format" rejection in PROD matches this: a value you create or copy yourself isn't a registered key for this project.
   - Conclusion: an outside production backend sending through this workspace's managed Lovable Email is **not a supported setup** today. Only Lovable support could confirm whether an exception exists.

3. **"Send test" doesn't prove production works.** It runs inside Lovable's own systems, using this project's key and its TEST backend. It says nothing about the outside PROD system.

4. **Why the Emails screen still shows the old generic template.** The template list there comes from this project's deployed preview function on the TEST backend, not from GitHub or the PROD code.
   - The repository lists four template names: notification, lead-assigned, task-assigned and announcement. All four use one shared layout with three variants.
   - The deployed preview function was not redeployed after the new names were added, or the variants look identical. The supported fix is to redeploy the preview function on this project.

## Options for production email

| Option | Supported | Keeps databases separate | Notes |
|---|---|---|---|
| A. Ask Lovable support for an officially issued key for outside use | Unknown, only support can say | Yes | Don't copy the existing key. Wait for an official answer. |
| B. Have PROD send through a provider you own (Resend, SendGrid, etc.) on a **different** subdomain, e.g. `mail.partneros.manwinwin.com` | Yes | Yes | It can't use `notify.` while that subdomain is handed to Lovable. PROD keeps its own key and logs. |
| C. Move production hosting into this Lovable project | Yes | No, unless restructured | This conflicts with the current TEST/PROD separation rule. |

Recommended: start with A. If support doesn't confirm, go with B. Either way, the TEST project keeps using managed Lovable Email on `notify.`.

## Next steps once you approve (no changes have been made yet)

1. Redeploy the TEST preview function so the Emails screen shows the lead, task and announcement templates. Check their previews. No emails are sent.
2. Write a short request to Lovable support asking about Option A, without including any secrets.
3. If you choose Option B:
   - Plan the PROD-only change: point the PROD sender at the new provider and a new subdomain, with the key stored only in PROD secrets.
   - Keep `email_send_log` and the notification status tracking unchanged.
   - Validate on PROD separately.

## Technical notes
- You see delivery logs for Lovable-managed sends in Cloud -> Emails. These come from the TEST project only.
- PROD logs stay in PROD's `email_send_log`.
- No secrets were read or shown during this assessment.

---

# Feasibility: deploy only `partner-growth-invite` to TEST (read-only answer)

**Short answer:** this can't be done safely as described without an explicit step from you, and it can't be done straight from the unmerged GitHub branch.

## Blockers

1. **The function isn't here.**
   - This workspace only has the default branch. `partner-growth-invite` isn't in it, and the branch `feature/partner-growth-s4b2-invites-academy-test-20261011` isn't available to me.
   - Lovable deploys functions only from the files in the workspace. It can't deploy from a GitHub branch.
2. **Bringing it in touches the default branch.**
   - Copying the file into this workspace creates a commit on main, and main syncs to Vercel automatically.
   - A single function file doesn't change the frontend bundle, but it is still a change to the default branch, which you asked to avoid.
   - A Lovable draft keeps code off main. But drafts share the same TEST backend, and it isn't confirmed that a function can be deployed from a draft before the draft is accepted.
3. **The TEST backend is shared.**
   - The TEST backend also serves the published Lovable app (partneros-manwinwin.lovable.app).
   - Secrets such as `PARTNER_GROWTH_INVITES_ENABLED` and `PARTNER_GROWTH_INVITE_REDIRECT_URL` apply to everything on that backend. PROD (qownzparzsaeoyccgwuj) is not affected.
4. **Redirect allowlist not checked.** I can't read the TEST sign-in redirect allowlist read-only from here. It needs one read-only settings check before any invite. That check doesn't change any setting.
5. **The invite email path isn't confirmed.** Invites go through the TEST account-email sender on `notify.partneros.manwinwin.com`. I haven't reviewed the branch code, so I can't confirm whether it uses that path.

## Safest path (each step needs your explicit OK)

1. You approve adding only `supabase/functions/partner-growth-invite/` to the workspace. Either:
   - as a Lovable draft, if you accept that the code stays unreviewed there, or
   - by merging just that folder.
2. I review the function code, without running it.
3. I check the TEST redirect allowlist, read-only, and confirm your approved preview callback URL is on it.
4. Add the two TEST secrets. `PARTNER_GROWTH_INVITES_ENABLED` is a fixed value I can save. For the redirect URL, you give me the exact address.
5. Deploy only `partner-growth-invite`, so no other function is redeployed.
6. You authorise the single invite to vitormc88+partneros-test@gmail.com. I then check the TEST logs.

What you need to do: approve how the code gets in (step 1), confirm the redirect URL, and authorise sending.
