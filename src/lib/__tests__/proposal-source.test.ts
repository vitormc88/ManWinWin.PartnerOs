import { describe, it, expect } from "vitest";
import {
  dealProposalSource,
  renewalProposalSource,
  buildProposalSourcePayload,
  isValidProposalSource,
  proposalStoragePrefix,
  readProposalSource,
} from "../proposal-source";

const DEAL = "11111111-1111-4111-8111-111111111111";
const RENEWAL = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const PARTNER = "44444444-4444-4444-8444-444444444444";

describe("proposal source identity", () => {
  it("keeps deal proposals on lead_id", () => {
    const p = buildProposalSourcePayload(dealProposalSource(DEAL));
    expect(p).toMatchObject({ source_type: "deal", lead_id: DEAL, deal_id: DEAL, renewal_id: null });
  });

  it("never writes a client id into lead_id for renewals", () => {
    const src = renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT, partnerUuid: PARTNER });
    const p = buildProposalSourcePayload(src);
    expect(p.lead_id).toBeNull();
    expect(p.deal_id).toBeNull();
    expect(p.renewal_id).toBe(RENEWAL);
    expect(p.client_id).toBe(CLIENT);
    expect(p.partner_uuid).toBe(PARTNER);
  });

  it("rejects non-uuid anchors", () => {
    expect(isValidProposalSource(dealProposalSource("not-a-uuid"))).toBe(false);
    expect(isValidProposalSource(renewalProposalSource({ renewalId: "derived-license-x", clientId: CLIENT }))).toBe(false);
    expect(isValidProposalSource(renewalProposalSource({ renewalId: RENEWAL, clientId: null }))).toBe(false);
    expect(isValidProposalSource(renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT }))).toBe(true);
  });

  it("uses the real anchor for storage paths", () => {
    expect(proposalStoragePrefix(dealProposalSource(DEAL))).toBe(DEAL);
    expect(proposalStoragePrefix(renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT }))).toBe(RENEWAL);
  });

  it("reads back persisted sources, defaulting legacy rows to deal", () => {
    expect(readProposalSource({ lead_id: DEAL })).toMatchObject({ source_type: "deal", deal_id: DEAL });
    expect(readProposalSource({ source_type: "renewal", renewal_id: RENEWAL, client_id: CLIENT })).toMatchObject({
      source_type: "renewal",
      renewal_id: RENEWAL,
    });
  });
});
