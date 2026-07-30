/**
 * Pure decision helpers for the license edit form (Phase 1C).
 *
 * The edit form displays NORMALIZED values (e.g. stored "ManWinWin" + KEEP-IT is
 * shown as "Business KeepIT", stored "Cloud/SaaS" is shown as "SaaS") but must
 * never persist that normalization implicitly. A stored legacy value may only be
 * replaced when the user explicitly picks a new value in the selector.
 *
 * `database_type` (database engine) is never part of any payload produced here.
 */

export interface LicenseEditState {
  /** Exact stored product, unchanged. */
  rawProduct: string;
  /** Exact stored deployment_type, unchanged. */
  rawDeployment: string;
  /** Value currently shown/selected in the product selector. */
  selectedProduct: string;
  /** Value currently shown/selected in the deployment selector. */
  selectedDeployment: string;
  /** True only when the user explicitly changed the product selector. */
  productChanged: boolean;
  /** True only when the user explicitly changed the deployment selector. */
  deploymentChanged: boolean;
}

export interface LicenseWriteValues {
  product: string | null;
  deployment_type: string | null;
}

/**
 * Resolves which product / deployment values must be written for a license edit.
 * Untouched fields keep their exact raw stored value.
 */
export function resolveLicenseWriteValues(state: LicenseEditState): LicenseWriteValues {
  const product = state.productChanged ? state.selectedProduct : state.rawProduct;
  const deployment = state.deploymentChanged ? state.selectedDeployment : state.rawDeployment;
  return {
    product: product || null,
    deployment_type: deployment || null,
  };
}

export interface ClientSummaryUpdate {
  license_type?: string | null;
  cloud_onpremise?: string | null;
}

/**
 * Client-level summary fields mirror the license, but only for fields the user
 * explicitly changed. Returns `null` when there is nothing to update.
 */
export function buildClientSummaryUpdate(state: LicenseEditState): ClientSummaryUpdate | null {
  const update: ClientSummaryUpdate = {};
  if (state.productChanged) update.license_type = state.selectedProduct || null;
  if (state.deploymentChanged) update.cloud_onpremise = state.selectedDeployment || null;
  return Object.keys(update).length > 0 ? update : null;
}
