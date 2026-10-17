// Real TEST browser login only. Uses disposable local Vite frontend and Supabase TEST.
// Never records screenshots, traces, storageState or tokens.
import { test, expect } from "@playwright/test";
import { QA_ROLES, TEST_REF, validateTarget } from "./contract.mjs";

const LOCAL_ORIGIN = "http://127.0.0.1:4173";
const TEST_HOST = TEST_REF + ".supabase.co";
test.use({ baseURL: LOCAL_ORIGIN, trace:"off", screenshot:"off", video:"off" });
test.describe.configure({ mode: "serial" });

for (const alias of ["sales","admin","hq"]) {
  test(alias + " signs in with real TEST Auth through PartnerOS UI", async ({ page }) => {
    validateTarget(process.env.GATE3_TEST_SUPABASE_URL);
    if (process.env.GATE3_QA_TEST_ONLY_ACK !== "TEST_ONLY") {
      throw new Error("BLOCKED: browser QA TEST_ONLY confirmation absent");
    }
    const names = QA_ROLES[alias];
    const email = process.env[names.email];
    const password = process.env[names.password];
    if (!email || !password) throw new Error("BLOCKED: dedicated QA login missing");
    const supabaseHosts = new Set();
    page.on("request", (req) => {
      try {
        const host = new URL(req.url()).hostname;
        if (host.endsWith(".supabase.co")) supabaseHosts.add(host);
      } catch { /* ignore non-URL requests */ }
    });
    await page.goto("/auth");
    await expect(page.getByRole("button",{name:"Sign In"})).toBeVisible({timeout:30000});
    await page.getByPlaceholder("you@company.com").fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button",{name:"Sign In"}).click();
    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/, {timeout:30000});

    // Protected Clients page uses the signed-in session rather than SQL impersonation.
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/clients(?:[?#]|$)/, {timeout:30000});
    await expect(page.getByText("Sign in to your account")).toHaveCount(0);
    await expect.poll(() => supabaseHosts.has(TEST_HOST), {timeout:15000})
      .toBeTruthy();
    expect([...supabaseHosts].every(x => x === TEST_HOST),
      "all signed-in browser API traffic must go to Supabase TEST").toBe(true);
    // Page/browser context disposed by Playwright; no persisted session artifact.
  });
}
