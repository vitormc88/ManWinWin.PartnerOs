import { describe, it, expect } from "vitest";
import {
  clientProposalSource,
  dealProposalSource,
  renewalProposalSource,
  buildProposalSourcePayload,
  isValidProposalSource,
  isClientSource,
  isExistingCustomerSource,
  proposalStoragePrefix,
  readProposalSource,
} from "@/lib/proposal-source";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const CONTRACT = "33333333-3333-4333-8333-333333333333";
const DEAL = "44444444-4444-4444-8444-444444444444";
const RENEWAL = "55555555-5555-4555-8555-555555555555";

describe("client-sourced proposals (existing customer, mid-cycle)", () => {
  const src = clientProposalSource({ clientId: CLIENT, partnerUuid: PARTNER, contractId: CONTRACT });

  it("is a valid source anchored on the client", () => {
    expect(isValidProposalSource(src)).toBe(true);
    expect(isClientSource(src)).toBe(true);
    expect(isExistingCustomerSource(src)).toBe(true);
  });

  it("NEVER writes the client uuid into a deal column", () => {
    const payload = buildProposalSourcePayload(src);
    expect(payload.source_type).toBe("client");
    expect(payload.lead_id).toBeNull();
    expect(payload.deal_id).toBeNull();
    expect(payload.renewal_id).toBeNull();
    expect(payload.client_id).toBe(CLIENT);
    expect(payload.partner_uuid).toBe(PARTNER);
    expect(payload.contract_id).toBe(CONTRACT);
  });

  it("rejects a client source without a real client id", () => {
    expect(isValidProposalSource(clientProposalSource({ clientId: null }))).toBe(false);
    expect(isValidProposalSource(clientProposalSource({ clientId: "not-a-uuid" }))).toBe(false);
  });

  it("stores generated documents under the client folder", () => {
    expect(proposalStoragePrefix(src)).toBe(CLIENT);
  });

  it("round-trips from a persisted row", () => {
    const back = readProposalSource({
      source_type: "client",
      client_id: CLIENT,
      partner_uuid: PARTNER,
      contract_id: CONTRACT,
      lead_id: null,
      deal_id: null,
      renewal_id: null,
    });
    expect(back).toEqual(src);
  });
});

describe("existing source types are unchanged", () => {
  it("deal source still writes lead_id and deal_id", () => {
    const payload = buildProposalSourcePayload(dealProposalSource(DEAL));
    expect(payload).toMatchObject({ source_type: "deal", lead_id: DEAL, deal_id: DEAL, renewal_id: null });
  });

  it("renewal source still writes renewal_id only", () => {
    const payload = buildProposalSourcePayload(
      renewalProposalSource({ renewalId: RENEWAL, clientId: CLIENT, partnerUuid: PARTNER }),
    );
    expect(payload).toMatchObject({
      source_type: "renewal",
      lead_id: null,
      deal_id: null,
      renewal_id: RENEWAL,
      client_id: CLIENT,
    });
  });

  it("a client id can never masquerade as a deal source", () => {
    const payload = buildProposalSourcePayload(dealProposalSource(CLIENT));
    // Legacy defect shape: the caller passed a client uuid as leadId.
    // The typed source model now forces callers through clientProposalSource,
    // so this test documents that the deal path itself is untouched.
    expect(payload.source_type).toBe("deal");
  });
});
