/**
 * Canonical proposal-document storage layer.
 *
 * Document generation is a READ-ONLY commercial action: it renders the
 * persisted proposal, uploads the file and records ONLY the document
 * reference on the proposal row. It never changes status, values or items.
 *
 * Object key layout (bucket `proposals`, never repeated inside the key):
 *   {source_anchor_id}/{proposal_id}/{safe_filename}.docx
 * Storage RLS authorizes on segment 2 (the proposal id), so the same HQ /
 * partner ownership rules that guard the proposal guard its documents.
 */

import { supabase } from "@/integrations/supabase/client";

export const PROPOSAL_DOCS_BUCKET = "proposals";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Storage keys accept a conservative charset only — strip everything else. */
export function safeDocxFileName(fileName: string): string {
  const base = (fileName || "proposal.docx").replace(/\.docx$/i, "");
  const ascii = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return `${ascii || "proposal"}.docx`;
}

/** Deterministic object key. Never prefixed with the bucket name. */
export function proposalDocumentPath(
  anchorId: string,
  proposalId: string,
  fileName: string,
): string {
  const prefix = (anchorId || "unassigned").replace(/^\/+|\/+$/g, "");
  return `${prefix}/${proposalId}/${safeDocxFileName(fileName)}`;
}

export type ProposalDocResult =
  | { ok: true; path: string; fileName: string }
  | { ok: false; error: string };

/**
 * Upload the generated DOCX and record its reference on the proposal.
 * Nothing else on the proposal is written — no status, no totals, no items.
 */
export async function storeProposalDocument(opts: {
  proposalId: string;
  anchorId: string;
  fileName: string;
  blob: Blob;
}): Promise<ProposalDocResult> {
  const path = proposalDocumentPath(opts.anchorId, opts.proposalId, opts.fileName);

  const { error: upErr } = await supabase.storage
    .from(PROPOSAL_DOCS_BUCKET)
    .upload(path, opts.blob, { contentType: DOCX_MIME, upsert: true });

  if (upErr) {
    return { ok: false, error: `Document upload failed: ${upErr.message}` };
  }

  const { error: refErr } = await supabase
    .from("proposals")
    .update({ docx_url: path, generated_at: new Date().toISOString() })
    .eq("id", opts.proposalId);

  if (refErr) {
    return { ok: false, error: `Document saved but could not be linked: ${refErr.message}` };
  }

  return { ok: true, path, fileName: safeDocxFileName(opts.fileName) };
}

/** Short-lived signed URL for a stored proposal document. */
export async function signProposalDocument(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PROPOSAL_DOCS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}
