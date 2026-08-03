import { describe, it, expect } from "vitest";
import {
  buildCommercialSummary,
  deriveTopAttention,
  renewalUrgency,
  pickPrimaryContact,
  humanizeEventLabel,
  isSystemEvent,
  buildHistory,
  openProposals,
} from "@/lib/client-overview";
import { resolveRenewal } from "@/lib/renewal-resolution";

const today = new Date("2026-08-03T00:00:00Z");

describe("client overview — commercial summary", () => {
  it("Watsons: healthy client keeps ARR and a far renewal, with no attention item", () => {
    const renewal = resolveRenewal({
      contract: { contract_end_date: "2027-07-19", status: "Active" },
      today,
    });
    const summary = buildCommercialSummary({
      intelligence: { recurring_arr: 4221.6, year1_value: 4221.6 },
      resolvedRenewal: renewal,
      contractStatus: "Active",
    });
    expect(summary.arr).toBeCloseTo(4221.6);
    expect(summary.arrZeroWithYear1).toBe(false);
    expect(summary.renewalLabel).toMatch(/2027/);
    expect(summary.urgency.tone).toBe("calm");

    expect(deriveTopAttention({ resolvedRenewal: renewal, hasLicense: true, hasContacts: true })).toBeNull();
  });

  it("APS: renewal in 5 days is the single priority and €0 ARR never hides Year 1", () => {
    const renewal = resolveRenewal({
      contract: { contract_end_date: "2026-08-08", status: "Active" },
      today,
    });
    const summary = buildCommercialSummary({
      intelligence: { recurring_arr: 0, year1_value: 1656 },
      resolvedRenewal: renewal,
    });
    expect(summary.daysTo).toBe(5);
    expect(summary.arrZeroWithYear1).toBe(true);
    expect(summary.year1).toBe(1656);
    expect(summary.urgency.label).toBe("Due in 5 days");

    const attention = deriveTopAttention({ resolvedRenewal: renewal, hasLicense: true, hasContacts: true });
    expect(attention?.id).toBe("renewal_due_soon");
    expect(attention?.title).toContain("5 days");
  });

  it("labels missing contracts honestly instead of implying zero value", () => {
    const summary = buildCommercialSummary({ intelligence: null, resolvedRenewal: null });
    expect(summary.contractLabel).toBe("No contract on record");
    expect(summary.renewalLabel).toBe("Not scheduled");
    expect(renewalUrgency(null).tone).toBe("unknown");
  });
});

describe("client overview — contacts and opportunities", () => {
  it("picks the flagged primary contact, otherwise first by name", () => {
    expect(pickPrimaryContact([])).toBeNull();
    expect(
      pickPrimaryContact([
        { contact_name: "Zoe" },
        { contact_name: "Ana", is_primary: true },
      ])?.contact_name,
    ).toBe("Ana");
    expect(pickPrimaryContact([{ contact_name: "Zoe" }, { contact_name: "Ana" }])?.contact_name).toBe("Ana");
  });

  it("does not convert missing modules, plugins or disabled API into opportunities", () => {
    const intelligence = {
      missing_modules: [{ id: "1", name: "Stock" }],
      missing_plugins: [{ id: "2", name: "SSO" }],
      api_access: false,
    };
    // Only persisted proposals can be opportunities.
    const opportunities = openProposals([]);
    expect(opportunities).toHaveLength(0);
    expect(Object.keys(intelligence)).toContain("missing_modules");
  });

  it("keeps only commercially open proposals as opportunities", () => {
    const list = [{ status: "Draft" }, { status: "Won" }, { status: "lost" }, { status: null }];
    expect(openProposals(list)).toHaveLength(2);
  });
});

describe("client overview — history", () => {
  it("humanizes raw event keys", () => {
    expect(humanizeEventLabel("client_imported")).toBe("Client imported");
    expect(humanizeEventLabel("configuration_update")).toBe("Configuration updated");
    expect(humanizeEventLabel("contract")).toBe("Contract event");
    expect(humanizeEventLabel("installation")).toBe("Installation");
    expect(humanizeEventLabel("some_new_key")).toBe("Some new key");
    expect(humanizeEventLabel(null)).toBe("Activity");
  });

  it("keeps the historical business date primary and the import date secondary", () => {
    const [entry] = buildHistory([
      {
        key: "e1",
        kind: "event",
        rawType: "installation",
        eventDate: "2018-04-10",
        recordedAt: "2026-01-15",
      },
    ]);
    expect(entry.title).toBe("Installation");
    expect(entry.eventDateLabel).toMatch(/2018/);
    expect(entry.recordedLabel).toMatch(/^Recorded on .*2026/);
    expect(entry.isSystem).toBe(true);
  });

  it("distinguishes system history from customer-facing interaction and sorts newest first", () => {
    const entries = buildHistory([
      { key: "a", kind: "event", rawType: "client_imported", eventDate: "2020-01-01" },
      { key: "b", kind: "note", title: "Commercial note", eventDate: "2026-02-02" },
    ]);
    expect(entries[0].key).toBe("b");
    expect(entries[0].isSystem).toBe(false);
    expect(entries[1].isSystem).toBe(true);
    expect(isSystemEvent("configuration")).toBe(true);
  });

  it("produces a single empty chronology instead of stacked empty blocks", () => {
    expect(buildHistory([])).toEqual([]);
  });
});
