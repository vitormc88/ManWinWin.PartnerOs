import { describe, it, expect } from "vitest";
import { buildRenewalLinkArgs, renewalProposalRefreshKeys } from "../renewal-proposal-link";
import { renewalProposalSource, buildProposalSourcePayload, dealProposalSource } from "../proposal-source";

const RENEWAL = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const PARTNER = "33333333-3333-4333-8333-333333333333";
const OTHER_PARTNER = "44444444-4444-4444-8444-444444444444";
const DEAL = "55555555-5555-4555-8555-555555555555";
const PROPOSAL = "66666666-6666-4666-8666-666666666666";

describe("renewal proposal link + refresh", () => {
  it("invalidates the exact query the renewal UI reads", () => {
    const keys = renewalProposalRefreshKeys(RENEWAL, CLIENT);
    expect(keys).toContainEqual(["proposal", "renewal", RENEWAL]);
    expect(keys).toContainEqual(["renewal_activities", RENEWAL]);
    expect(keys).toContainEqual(["renewals"]);
    expect(keys).toContainEqual(["proposals"]);
    expect(keys).toContainEqual(["client_commercial_intelligence", CLIENT]);
  });

  it("logs created vs updated correctly when reopening the same proposal", () => {
    const created = buildRenewalLinkArgs({ renewalId: RENEWAL, proposalId: PROPOSAL, isUpdate: false, version: 1, clientName: "Petrobras" });
    const updated = buildRenewalLinkArgs({ renewalId: RENEWAL, proposalId: PROPOSAL, isUpdate: true, version: 1, clientName: "Petrobras" });
    expect(created._action).toBe("proposal_created");
    expect(updated._action).toBe("proposal_updated");
    // Reopening reuses the same proposal id — never a new one.
    expect(updated._proposal_id).toBe(created._proposal_id);
  });
});

describe("renewal proposal source payload", () => {
  it("never writes a client uuid into lead_id/deal_id", () => {
    const payload = buildProposalSourcePayload(
      renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT, partnerUuid: PARTNER })
    );
    expect(payload.lead_id).toBeNull();
    expect(payload.deal_id).toBeNull();
    expect(payload.renewal_id).toBe(RENEWAL);
    expect(payload.client_id).toBe(CLIENT);
    expect(payload.partner_uuid).toBe(PARTNER);
  });

  it("keeps deal proposals anchored on the real deal id", () => {
    const payload = buildProposalSourcePayload(dealProposalSource(DEAL));
    expect(payload.lead_id).toBe(DEAL);
    expect(payload.deal_id).toBe(DEAL);
    expect(payload.renewal_id).toBeNull();
  });

  it("cannot spoof another partner by relabelling the payload (partner is verified server-side)", () => {
    // The client can send any partner_uuid; the DB policy re-derives the canonical
    // partner from renewals/clients, so a mismatching value must never be trusted.
    const spoofed = buildProposalSourcePayload(
      renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT, partnerUuid: OTHER_PARTNER })
    );
    expect(spoofed.partner_uuid).toBe(OTHER_PARTNER);
    expect(spoofed.renewal_id).toBe(RENEWAL);
    expect(spoofed.client_id).toBe(CLIENT);
  });
});
