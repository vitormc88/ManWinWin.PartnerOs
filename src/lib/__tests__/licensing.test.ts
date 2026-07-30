import { describe, expect, it } from "vitest";
import {
  looksLikeDatabaseEngine,
  normalizeDeployment,
  normalizeLicenseModel,
  normalizeLicenseProduct,
  readDeployment,
  readLicenseVocabulary,
} from "@/lib/licensing";

describe("normalizeLicenseProduct", () => {
  it("resolves generic ManWinWin + KEEP-IT to Business KeepIT", () => {
    const p = normalizeLicenseProduct("ManWinWin", { licenseModel: "KEEP-IT" });
    expect(p.value).toBe("Business KeepIT");
    expect(p.family).toBe("Business");
    expect(p.isUnmapped).toBe(false);
  });

  it("resolves generic ManWinWin + USE-IT to Business UseIT", () => {
    const p = normalizeLicenseProduct("ManWinWin", { licenseModel: "USE-IT" });
    expect(p.value).toBe("Business UseIT");
  });

  it("preserves an already canonical product", () => {
    const p = normalizeLicenseProduct("Business KeepIT");
    expect(p.value).toBe("Business KeepIT");
    expect(p.isUnmapped).toBe(false);
  });

  it("keeps an unknown product visible and unmapped", () => {
    const p = normalizeLicenseProduct("SomeLegacyThing", { licenseModel: "" });
    expect(p.value).toBe("SomeLegacyThing");
    expect(p.isUnmapped).toBe(true);
    expect(p.isLegacy).toBe(true);
  });

  it("does not guess a product from a generic name without model or edition", () => {
    const p = normalizeLicenseProduct("ManWinWin");
    expect(p.value).not.toBe("Business KeepIT");
  });
});

describe("deployment normalization", () => {
  it("maps Cloud/SaaS to SaaS", () => {
    expect(normalizeDeployment("Cloud/SaaS").value).toBe("SaaS");
  });

  it("maps SaaS direto to SaaS", () => {
    expect(normalizeDeployment("SaaS direto").value).toBe("SaaS");
  });

  it("never interprets a database engine as deployment", () => {
    expect(looksLikeDatabaseEngine("Microsoft SQL Server")).toBe(true);
    const d = normalizeDeployment("Microsoft SQL Server");
    expect(d.value).toBe("");
    expect(d.raw).toBe("");
  });

  it("ignores database_type when it holds an engine value", () => {
    const d = readDeployment({ deployment_type: null, database_type: "Microsoft SQL Server" });
    expect(d.value).toBe("");
  });

  it("prefers deployment_type over any legacy column", () => {
    const d = readDeployment({ deployment_type: "Cloud/SaaS", database_type: "Microsoft SQL Server" });
    expect(d.value).toBe("SaaS");
  });
});

describe("readLicenseVocabulary — production-shaped Watsons license", () => {
  const watsons = {
    product: "ManWinWin",
    edition: null,
    license_model: "KEEP-IT",
    version: "7.2.6.0",
    deployment_type: "Cloud/SaaS",
    database_type: "Microsoft SQL Server",
  };

  it("renders the correct canonical semantics without touching stored values", () => {
    const v = readLicenseVocabulary(watsons);
    expect(v.product.family).toBe("Business");
    expect(v.product.value).toBe("Business KeepIT");
    expect(normalizeLicenseModel(watsons.product, watsons.license_model)).toBe("KEEP-IT");
    expect(v.deployment.value).toBe("SaaS");
    expect(v.version).toBe("7.2.6.0");
  });

  it("preserves the database engine separately from deployment", () => {
    const v = readLicenseVocabulary(watsons);
    expect(v.databaseEngine).toBe("Microsoft SQL Server");
    expect(v.deployment.label).not.toContain("SQL");
  });
});
