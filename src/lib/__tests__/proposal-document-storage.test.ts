import { describe, it, expect } from "vitest";
import {
  safeDocxFileName,
  proposalDocumentPath,
  PROPOSAL_DOCS_BUCKET,
  DOCX_MIME,
} from "@/lib/proposal-document-storage";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const PROPOSAL = "22222222-2222-4222-8222-222222222222";

describe("proposal document storage keys", () => {
  it("sanitizes unsafe filenames", () => {
    expect(safeDocxFileName("Proposal_Águas & Cia/2026_v1.docx")).toBe(
      "Proposal_Aguas_Cia_2026_v1.docx",
    );
    expect(safeDocxFileName("")).toBe("proposal.docx");
  });

  it("builds a deterministic path without duplicating the bucket prefix", () => {
    const path = proposalDocumentPath(CLIENT, PROPOSAL, "Proposal Client v1.docx");
    expect(path).toBe(`${CLIENT}/${PROPOSAL}/Proposal_Client_v1.docx`);
    expect(path.startsWith(`${PROPOSAL_DOCS_BUCKET}/`)).toBe(false);
    // Segment 2 is the proposal id — the segment storage RLS authorizes on.
    expect(path.split("/")[1]).toBe(PROPOSAL);
  });

  it("uses the OOXML wordprocessing MIME type", () => {
    expect(DOCX_MIME).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
