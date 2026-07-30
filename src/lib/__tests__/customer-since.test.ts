import { describe, it, expect } from "vitest";
import { resolveCustomerSince, CUSTOMER_SINCE_UNKNOWN_LABEL } from "@/lib/customer-since";

describe("Customer Since semantics", () => {
  it("explicit customer_since wins over everything else", () => {
    const r = resolveCustomerSince({
      client: {
        customer_since: "2009-04-01",
        first_installation_date: "2015-01-01",
        created_at: "2026-01-01T10:00:00Z",
      },
    });
    expect(r.value).toBe("2009-04-01");
    expect(r.source).toBe("explicit_customer_since");
    expect(r.isEstimated).toBe(false);
  });

  it("first installation date is a factual business source", () => {
    const r = resolveCustomerSince({ client: { first_installation_date: "2011-06-15", created_at: "2026-01-01" } });
    expect(r.value).toBe("2011-06-15");
    expect(r.source).toBe("first_installation_date");
    expect(r.isEstimated).toBe(false);
  });

  it("created_at / updated_at / imported_at never become a factual Customer Since", () => {
    const r = resolveCustomerSince({
      client: { created_at: "2026-01-01T10:00:00Z", updated_at: "2026-02-01", imported_at: "2026-01-02" },
    });
    expect(r.value).toBeNull();
    expect(r.source).toBe("unknown");
    expect(r.unknownLabel).toBe(CUSTOMER_SINCE_UNKNOWN_LABEL);
  });

  it("no real date and no estimate allowed → Unknown", () => {
    const r = resolveCustomerSince({
      client: { created_at: "2026-01-01" },
      contracts: [{ contract_start_date: "2020-01-01" }],
      licenses: [{ license_start_date: "2019-01-01" }],
    });
    expect(r.value).toBeNull();
    expect(r.confidence).toBe("none");
  });

  it("opt-in inference returns the oldest contract flagged as estimated", () => {
    const r = resolveCustomerSince({
      client: { created_at: "2026-01-01" },
      contracts: [{ contract_start_date: "2020-01-01" }, { contract_start_date: "2017-03-05" }],
      allowEstimate: true,
    });
    expect(r.value).toBe("2017-03-05");
    expect(r.source).toBe("oldest_contract_start");
    expect(r.isEstimated).toBe(true);
    expect(r.confidence).toBe("medium");
  });

  it("license fallback is lower confidence and still estimated", () => {
    const r = resolveCustomerSince({
      client: {},
      licenses: [{ license_start_date: "2018-08-01" }],
      allowEstimate: true,
    });
    expect(r.source).toBe("oldest_license_start");
    expect(r.isEstimated).toBe(true);
    expect(r.confidence).toBe("low");
  });

  it("ignores invalid / empty date values", () => {
    const r = resolveCustomerSince({ client: { first_installation_date: "   ", customer_since: "not-a-date" } });
    expect(r.value).toBeNull();
  });
});
