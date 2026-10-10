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
