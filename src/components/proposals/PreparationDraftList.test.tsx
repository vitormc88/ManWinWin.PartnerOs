import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreparationDraftList } from "./PreparationDraftList";
import { PREPARATION_LIST_COLUMNS, type PreparationListRow } from "@/lib/proposal-preparation";

afterEach(cleanup);
// The actual PostgREST projection: a small scope alias, deliberately no `body`.
const row: PreparationListRow = { id:"p",client_id:"c",license_id:"l",contract_id:"k",partner_uuid:null,proposal_id:null,proposal_updated_at:null,kind:"addition",updated_at:"2026-10-31T10:00:00Z",scope:{backoffice:1,web:2,products:["requests"]} };
describe("Preparation list query/render boundary", () => {
  it("renders projected list rows without document bodies and opens the same identity", () => {
    expect(PREPARATION_LIST_COLUMNS).toContain("scope:body->draft->selection");
    expect(row).not.toHaveProperty("body");
    const open = vi.fn();render(<PreparationDraftList rows={[row]} onOpen={open}/>);
    expect(screen.getByText("+1 BackOffice · +2 WEB · Maintenance Requests")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Continue saved preparation/}));expect(open).toHaveBeenCalledWith(row);
  });
  it("keeps the list usable for incomplete older scopes and service requests", () => {
    render(<PreparationDraftList rows={[{...row,scope:undefined},{...row,id:"r",kind:"request",scope:null}]} onOpen={()=>{}}/>);
    expect(screen.getByText("Continue to review the selected items")).toBeInTheDocument();
    expect(screen.getByText("Commercial review")).toBeInTheDocument();
  });
});
