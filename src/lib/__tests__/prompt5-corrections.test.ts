import { describe, it, expect } from "vitest";
import { resolvePartnerLeadDefaults, normalizeCountryName } from "@/lib/lead-defaults";
import { deriveWorkGuidance } from "@/lib/task-guidance";
import { formatDateOnly, isSameLocalDay } from "@/lib/date-format";
import { resolveProposalLifecycle, isProposalSent } from "@/lib/proposal-lifecycle";
import { countClientsDueWithin } from "@/lib/renewal-kpi";

describe("partner lead defaults", () => {
  it("preselects the authenticated user and normalized partner country", () => {
    expect(resolvePartnerLeadDefaults({ profileId: "u1", partnerCountry: "PH" })).toEqual({
      assignedUserId: "u1",
      country: "Philippines",
    });
    expect(resolvePartnerLeadDefaults({ profileId: "u2", partnerCountry: "PE" }).country).toBe("Peru");
  });

  it("keeps unknown legacy country values intact", () => {
    expect(normalizeCountryName("Freedonia")).toBe("Freedonia");
    expect(normalizeCountryName(null)).toBe("");
  });
});

describe("work guidance", () => {
  const t = (o: Partial<any> = {}) => ({ status: "open", priority: "Medium", source: "lead", ...o });

  it("never tells the user to handle critical items when critical = 0", () => {
    const lines = deriveWorkGuidance([
      t({ due_date: "2000-01-01" }),
      t({ due_date: "2000-01-02" }),
    ]);
    expect(lines.join(" ")).not.toMatch(/critical/i);
  });

  it("flags overdue critical tasks when they exist", () => {
    const lines = deriveWorkGuidance([t({ priority: "Critical", due_date: "2000-01-01" })]);
    expect(lines.join(" ")).toMatch(/critical task is overdue/i);
  });
});

describe("renewal counting and dates", () => {
  it("counts distinct clients, not component rows", () => {
    const rows = [
      { client_id: "aps", renewal_date: "2026-08-08", status: "Upcoming" },
      { client_id: "aps", renewal_date: "2026-08-08", status: "Upcoming" },
      { client_id: "aps", renewal_date: "2026-08-08", status: "Upcoming" },
    ];
    expect(countClientsDueWithin(rows, 30, null, new Date(2026, 7, 3))).toBe(1);
  });

  it("ignores closed renewals and out-of-window dates", () => {
    const rows = [
      { client_id: "a", renewal_date: "2026-08-08", status: "Won" },
      { client_id: "b", renewal_date: "2027-01-01", status: "Upcoming" },
    ];
    expect(countClientsDueWithin(rows, 30, null, new Date(2026, 7, 3))).toBe(0);
  });

  it("formats date-only values without timezone day shift", () => {
    expect(formatDateOnly("2026-08-08")).toMatch(/^08 \w+ 2026$/);
    expect(formatDateOnly(null)).toBe("—");
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(isSameLocalDay(iso)).toBe(true);
  });
});

describe("proposal lifecycle", () => {
  it("treats Draft/Ready/generated as generated, not sent", () => {
    expect(isProposalSent({ status: "Draft" })).toBe(false);
    const l = resolveProposalLifecycle([{ status: "Ready", created_at: "2026-01-01" }], []);
    expect(l.state).toBe("generated");
    expect(l.sentAt).toBeNull();
  });

  it("marks sent only on an explicit status or activity signal", () => {
    expect(resolveProposalLifecycle([{ status: "Sent", created_at: "2026-01-01" }], []).state).toBe("sent");
    expect(
      resolveProposalLifecycle(
        [{ status: "Draft", created_at: "2026-01-01" }],
        [{ activity_type: "proposal_sent", created_at: "2026-01-05" }]
      ).state
    ).toBe("sent");
  });

  it("never infers sent from proposal existence alone", () => {
    expect(resolveProposalLifecycle([{ created_at: "2026-01-01" }], []).state).toBe("generated");
    expect(resolveProposalLifecycle([], []).state).toBe("none");
  });
});
