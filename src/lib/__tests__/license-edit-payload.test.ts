import { describe, expect, it } from "vitest";
import {
  buildClientSummaryUpdate,
  resolveLicenseWriteValues,
  type LicenseEditState,
} from "@/lib/license-edit-payload";
import { readLicenseVocabulary } from "@/lib/licensing";

/** Production-shaped Watsons license row (reference fixture, never written). */
const watsonsRow = {
  product: "ManWinWin",
  edition: null,
  license_model: "KEEP-IT",
  version: "7.2.6.0",
  deployment_type: "Cloud/SaaS",
  database_type: "Microsoft SQL Server",
};

function openEditForm(row: typeof watsonsRow): LicenseEditState {
  const v = readLicenseVocabulary(row);
  return {
    rawProduct: row.product || "",
    rawDeployment: row.deployment_type || "",
    selectedProduct: v.product.value || "",
    selectedDeployment: v.deployment.value || v.deployment.raw || "",
    productChanged: false,
    deploymentChanged: false,
  };
}

describe("license edit payload — Watsons production shape", () => {
  it("displays canonical values while retaining the raw stored values", () => {
    const s = openEditForm(watsonsRow);
    expect(s.selectedProduct).toBe("Business KeepIT");
    expect(s.selectedDeployment).toBe("SaaS");
    expect(s.rawProduct).toBe("ManWinWin");
    expect(s.rawDeployment).toBe("Cloud/SaaS");
  });

  it("saving without changes preserves the raw product and deployment", () => {
    const w = resolveLicenseWriteValues(openEditForm(watsonsRow));
    expect(w.product).toBe("ManWinWin");
    expect(w.deployment_type).toBe("Cloud/SaaS");
  });

  it("never includes database_type in the write payload", () => {
    const w = resolveLicenseWriteValues(openEditForm(watsonsRow));
    expect(Object.keys(w)).toEqual(["product", "deployment_type"]);
    expect(JSON.stringify(w)).not.toContain("Microsoft SQL Server");
    expect(watsonsRow.database_type).toBe("Microsoft SQL Server");
  });

  it("issues no client summary update when neither field changes", () => {
    expect(buildClientSummaryUpdate(openEditForm(watsonsRow))).toBeNull();
  });
});

describe("explicit user changes", () => {
  it("writes the selected canonical product and preserves the raw deployment", () => {
    const s: LicenseEditState = {
      ...openEditForm(watsonsRow),
      selectedProduct: "Business UseIT",
      productChanged: true,
    };
    const w = resolveLicenseWriteValues(s);
    expect(w.product).toBe("Business UseIT");
    expect(w.deployment_type).toBe("Cloud/SaaS");
    expect(buildClientSummaryUpdate(s)).toEqual({ license_type: "Business UseIT" });
  });

  it("writes the selected canonical deployment and preserves the raw product", () => {
    const s: LicenseEditState = {
      ...openEditForm(watsonsRow),
      selectedDeployment: "On-Premise",
      deploymentChanged: true,
    };
    const w = resolveLicenseWriteValues(s);
    expect(w.product).toBe("ManWinWin");
    expect(w.deployment_type).toBe("On-Premise");
    expect(buildClientSummaryUpdate(s)).toEqual({ cloud_onpremise: "On-Premise" });
  });
});

describe("unknown legacy values", () => {
  const legacyRow = {
    product: "SomeLegacyThing",
    edition: null,
    license_model: "",
    version: "",
    deployment_type: "Servidor do cliente",
    database_type: "Microsoft SQL Server",
  };

  it("keeps unknown values visible and preserves them on an unchanged save", () => {
    const s = openEditForm(legacyRow as typeof watsonsRow);
    expect(s.selectedProduct).toBe("SomeLegacyThing");
    expect(s.selectedDeployment).toBe("Servidor do cliente");

    const w = resolveLicenseWriteValues(s);
    expect(w.product).toBe("SomeLegacyThing");
    expect(w.deployment_type).toBe("Servidor do cliente");
    expect(buildClientSummaryUpdate(s)).toBeNull();
  });

  it("still allows an intentional canonical replacement", () => {
    const s: LicenseEditState = {
      ...openEditForm(legacyRow as typeof watsonsRow),
      selectedProduct: "Professional 2",
      productChanged: true,
      selectedDeployment: "SaaS",
      deploymentChanged: true,
    };
    expect(resolveLicenseWriteValues(s)).toEqual({
      product: "Professional 2",
      deployment_type: "SaaS",
    });
    expect(buildClientSummaryUpdate(s)).toEqual({
      license_type: "Professional 2",
      cloud_onpremise: "SaaS",
    });
  });
});
