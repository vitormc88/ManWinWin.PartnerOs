import { describe, it, expect } from "vitest";
import { proposalSourceFromRecord, isProposalReadOnly, proposalActionLabel } from "@/lib/proposal-reopen";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const DEAL = "22222222-2222-4222-8222-222222222222";
const RENEWAL = "33333333-3333-4333-8333-333333333333";

describe("proposalSourceFromRecord", () => {
  it("rebuilds a client-anchored source without touching deal columns", () => {
    const src = proposalSourceFromRecord({ source_type: "client", client_id: CLIENT });
    expect(src).toMatchObject({ source_type: "client", client_id: CLIENT, deal_id: null, renewal_id: null });
  });

  it("rebuilds a renewal-anchored source", () => {
    const src = proposalSourceFromRecord({ source_type: "renewal", renewal_id: RENEWAL, client_id: CLIENT });
    expect(src).toMatchObject({ source_type: "renewal", renewal_id: RENEWAL, client_id: CLIENT, deal_id: null });
  });

  it("falls back to the deal source", () => {
    const src = proposalSourceFromRecord({ source_type: "deal", deal_id: DEAL });
    expect(src).toMatchObject({ source_type: "deal", deal_id: DEAL, client_id: null });
  });

  it("returns null without a record", () => {
    expect(proposalSourceFromRecord(null)).toBeNull();
  });
});

describe("isProposalReadOnly", () => {
  it("keeps drafts editable", () => {
    expect(isProposalReadOnly("Draft")).toBe(false);
    expect(isProposalReadOnly("Ready")).toBe(false);
    expect(isProposalReadOnly("Sent")).toBe(false);
  });

  it("locks closed proposals", () => {
    for (const s of ["Won", "Lost", "Rejected", "Cancelled", "Accepted", "Expired"]) {
      expect(isProposalReadOnly(s)).toBe(true);
    }
  });

  it("locks everything without edit permission", () => {
    expect(isProposalReadOnly("Draft", false)).toBe(true);
  });
});

describe("proposalActionLabel", () => {
  it("labels the commercial action", () => {
    expect(proposalActionLabel({ source_type: "client", renewal_change_mode: "upgrade" })).toBe("Upgrade");
    expect(proposalActionLabel({ source_type: "renewal", renewal_change_mode: "none" })).toBe("Renewal");
    expect(proposalActionLabel({ source_type: "client" })).toBe("Commercial action");
    expect(proposalActionLabel({ source_type: "deal" })).toBe("New business");
  });
});
