import { describe, it, expect, vi } from "vitest";
import {
  findEquivalentOpenRenewal,
  isEquivalentRenewal,
  renewalTargetIdentity,
  shouldCreateRenewalWorkflowRow,
} from "../renewal-identity";
import { createRenewalWorkflowRow } from "../renewal-workflow";

const CLIENT = "01fbe90e-d3ea-4635-96aa-8e04060b8182";
const contractTarget = {
  client_id: CLIENT,
  renewal_date: "2027-07-19",
  contract_id: "contract-1",
  target_type: "contract",
  target_id: "contract-1",
};

describe("renewalTargetIdentity", () => {
  it("normalizes contract_id and target_type/target_id to the same identity", () => {
    expect(renewalTargetIdentity({ contract_id: "c1" })).toEqual({ kind: "contract", id: "c1" });
    expect(renewalTargetIdentity({ target_type: "Contract", target_id: "c1" })).toEqual({ kind: "contract", id: "c1" });
    expect(renewalTargetIdentity({ license_id: "l1" })).toEqual({ kind: "license", id: "l1" });
    expect(renewalTargetIdentity({ target_type: "license", target_id: "l1" })).toEqual({ kind: "license", id: "l1" });
  });

  it("keeps other explicit target types distinct and falls back to none", () => {
    expect(renewalTargetIdentity({ target_type: "sat", target_id: "s1" })).toEqual({ kind: "sat", id: "s1" });
    expect(renewalTargetIdentity({ client_id: CLIENT })).toEqual({ kind: "none", id: null });
  });
});

describe("isEquivalentRenewal", () => {
  it("never matches on date alone", () => {
    expect(isEquivalentRenewal(contractTarget, {
      client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-2",
    })).toBe(false);
  });

  it("matches the same client + date + contract across field shapes", () => {
    expect(isEquivalentRenewal(contractTarget, {
      client_id: CLIENT, renewal_date: "2027-07-19", target_type: "contract", target_id: "contract-1",
    })).toBe(true);
  });

  it("only pairs target-less renewals with other target-less renewals", () => {
    const bare = { client_id: CLIENT, renewal_date: "2027-07-19" };
    expect(isEquivalentRenewal(bare, { ...bare })).toBe(true);
    expect(isEquivalentRenewal(bare, contractTarget)).toBe(false);
  });

  it("requires the same client", () => {
    expect(isEquivalentRenewal(contractTarget, { ...contractTarget, client_id: "other" })).toBe(false);
  });
});

describe("shouldCreateRenewalWorkflowRow", () => {
  it("(a) blocks a duplicate for the same entity + client + date", () => {
    const existing = [{ id: "r1", ...contractTarget, status: "Upcoming" }];
    expect(shouldCreateRenewalWorkflowRow(existing, contractTarget)).toBe(false);
    expect(shouldCreateRenewalWorkflowRow([...existing, ...existing], contractTarget)).toBe(false);
  });

  it("(b) allows a renewal for a different contract on the same date", () => {
    const existing = [{ id: "r1", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-2", status: "Upcoming" }];
    expect(shouldCreateRenewalWorkflowRow(existing, contractTarget)).toBe(true);
  });

  it("(c) allows a renewal for a different license on the same date", () => {
    const licenseTarget = { client_id: CLIENT, renewal_date: "2027-07-19", license_id: "lic-1" };
    const existing = [{ id: "r1", client_id: CLIENT, renewal_date: "2027-07-19", license_id: "lic-2", status: "Upcoming" }];
    expect(shouldCreateRenewalWorkflowRow(existing, licenseTarget)).toBe(true);
  });

  it("(d) is not blocked by a closed/cancelled equivalent renewal", () => {
    for (const status of ["Completed", "Cancelled", "Renewed", "Lost"]) {
      expect(shouldCreateRenewalWorkflowRow([{ id: "r1", ...contractTarget, status }], contractTarget)).toBe(true);
    }
  });

  it("ignores rows with invalid dates", () => {
    expect(shouldCreateRenewalWorkflowRow([{ id: "r1", ...contractTarget, renewal_date: "not-a-date", status: "Upcoming" }], contractTarget)).toBe(true);
  });
});

describe("findEquivalentOpenRenewal", () => {
  it("(e) returns the exact match, not the first row with the same date", () => {
    const existing = [
      { id: "wrong-contract", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-9", status: "Upcoming" },
      { id: "no-target", client_id: CLIENT, renewal_date: "2027-07-19", status: "Upcoming" },
      { id: "exact", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-1", status: "Upcoming" },
    ];
    expect(findEquivalentOpenRenewal(existing, contractTarget)?.id).toBe("exact");
  });

  it("returns null when nothing equivalent is open", () => {
    expect(findEquivalentOpenRenewal([], contractTarget)).toBeNull();
  });
});

describe("createRenewalWorkflowRow — real write path", () => {
  it("(f) inserts zero times when an equivalent exists and reuses that exact row", async () => {
    let inserts = 0;
    const outcome = await createRenewalWorkflowRow<any>({
      fetchExisting: async () => [
        { id: "other", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-9", status: "Upcoming" },
        { id: "exact", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-1", status: "Upcoming" },
      ],
      target: contractTarget,
      insert: async () => { inserts++; return { id: "new" }; },
    });
    expect(inserts).toBe(0);
    expect(outcome.created).toBe(false);
    expect(outcome.id).toBe("exact");
    expect(outcome.reason).toBe("reused_existing");
  });

  it("(f) inserts exactly once when no equivalent exists", async () => {
    let inserts = 0;
    const outcome = await createRenewalWorkflowRow<any>({
      fetchExisting: async () => [
        { id: "closed", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-1", status: "Cancelled" },
      ],
      target: contractTarget,
      insert: async () => { inserts++; return { id: "new" }; },
    });
    expect(inserts).toBe(1);
    expect(outcome.created).toBe(true);
    expect(outcome.id).toBe("new");
  });

  it("does not block a legitimate renewal for another contract", async () => {
    let inserts = 0;
    await createRenewalWorkflowRow<any>({
      fetchExisting: async () => [{ id: "r1", client_id: CLIENT, renewal_date: "2027-07-19", contract_id: "contract-2", status: "Upcoming" }],
      target: contractTarget,
      insert: async () => { inserts++; return { id: "new" }; },
    });
    expect(inserts).toBe(1);
  });
});

describe("createRenewalWorkflowRow — fail-closed duplicate check", () => {
  it("(2D) rejects and never inserts when fetchExisting fails", async () => {
    const insert = vi.fn(async () => ({ id: "new" }));
    const boom = new Error("network down");
    await expect(
      createRenewalWorkflowRow<any>({
        fetchExisting: async () => { throw boom; },
        target: contractTarget,
        insert,
      })
    ).rejects.toThrow("network down");
    expect(insert).toHaveBeenCalledTimes(0);
  });

  it("(2D) a rejected duplicate check never yields a 'created' outcome", async () => {
    const insert = vi.fn(async () => ({ id: "new" }));
    let outcome: any = null;
    try {
      outcome = await createRenewalWorkflowRow<any>({
        fetchExisting: () => Promise.reject(new Error("permission denied")),
        target: contractTarget,
        insert,
      });
    } catch (e: any) {
      expect(e.message).toBe("permission denied");
    }
    expect(outcome).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });
});
