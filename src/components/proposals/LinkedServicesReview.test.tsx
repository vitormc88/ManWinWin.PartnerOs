import {beforeEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {LinkedServicesReview} from "./LinkedServicesReview";
import type {AdditionBaseline} from "@/lib/commercial-additions";
const state=vi.hoisted(()=>({rpc:vi.fn(),changed:vi.fn(),dirty:vi.fn(),error:vi.fn(),read:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({invalidateQueries:vi.fn()})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:state.rpc,from:()=>({select:()=>({eq:()=>({single:state.read})})})}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:state.error}}));
const baseline={clientId:"c",clientName:"QA",licenseId:"l",contractId:"k"} as AdditionBaseline;
function fill(){fireEvent.change(screen.getByLabelText("Services budget owner"),{target:{value:"Rita"}});fireEvent.change(screen.getByLabelText("Training delivery"),{target:{value:"compare"}});fireEvent.change(screen.getByLabelText("Service quantity"),{target:{value:"2"}});fireEvent.change(screen.getByLabelText("Requested services discount (%)"),{target:{value:"25"}});fireEvent.change(screen.getByLabelText("Training / implementation scope"),{target:{value:"Stock and purchasing training"}});fireEvent.change(screen.getByLabelText("Travel / accommodation conditions"),{target:{value:"Separate travel estimate"}});fireEvent.change(screen.getByLabelText("Next services review date"),{target:{value:"2026-11-03"}});}
beforeEach(()=>{cleanup();vi.clearAllMocks();state.read.mockResolvedValue({data:null,error:new Error("Unavailable")});state.rpc.mockResolvedValue({data:{id:"req",updated_at:"2026-11-01"},error:null});});
describe("Linked service budget preparation",()=>{
 it("loads a newer services review before editing instead of overwriting it with a proposal's old snapshot",async()=>{
   const service={owner:"Current owner",scope:"Reviewed scope",modality:"online" as const,quantity:2,unit:"days" as const,requestedDiscount:25,expenses:"",status:"in_review" as const,quoteReference:"",nextDate:"2026-11-03"};
   state.read.mockResolvedValue({data:{id:"req",kind:"request",client_id:"c",license_id:"l",contract_id:"k",updated_at:"new-timestamp",body:{services:service}},error:null});
   render(<LinkedServicesReview baseline={baseline} value={{...service,id:"req",updatedAt:"old-timestamp",owner:"Old owner"}} onChange={state.changed}/>);
   await waitFor(()=>expect(screen.getByLabelText("Services budget owner")).toHaveValue("Current owner"));
   fireEvent.click(screen.getByRole("button",{name:"Save linked services review"}));
   await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith("save_proposal_preparation",expect.objectContaining({_id:"req",_expected_updated_at:"new-timestamp",_body:expect.objectContaining({services:expect.objectContaining({owner:"Current owner"})})})));
 });
 it("stores a separate scoped request with owner, delivery, quantity and requested discount, never a financial action",async()=>{render(<LinkedServicesReview baseline={baseline} onChange={state.changed} onDirtyChange={state.dirty}/>);expect(screen.getByRole("button",{name:"Create linked services request"})).toBeDisabled();fill();expect(state.dirty).toHaveBeenLastCalledWith(true);fireEvent.click(screen.getByRole("button",{name:"Create linked services request"}));await waitFor(()=>expect(state.changed).toHaveBeenCalledWith(expect.objectContaining({id:"req",owner:"Rita",requestedDiscount:25,modality:"compare",quantity:2})));expect(state.rpc).toHaveBeenCalledOnce();expect(state.rpc.mock.calls[0]).toMatchObject(["save_proposal_preparation",{_kind:"request",_proposal_id:null,_client_id:"c",_body:{services:{requestedDiscount:25},request:{serviceBaseline:{licenseId:"l"}}}}]);});
 it("retains entered scope after a failed request save",async()=>{state.rpc.mockResolvedValue({data:null,error:new Error("CONFLICT")});render(<LinkedServicesReview baseline={baseline} onChange={state.changed}/>);fill();fireEvent.click(screen.getByRole("button",{name:"Create linked services request"}));await waitFor(()=>expect(state.error).toHaveBeenCalled());expect(screen.getByLabelText("Requested services discount (%)")).toHaveValue(25);expect(state.changed).not.toHaveBeenCalled();});
 it("does not allow a quoted state without a quotation reference",()=>{render(<LinkedServicesReview baseline={baseline}/>);fill();fireEvent.change(screen.getByLabelText("Services budget status"),{target:{value:"quoted"}});expect(screen.getByRole("button",{name:"Create linked services request"})).toBeDisabled();expect(screen.getByText("Enter the separate services quotation reference.")).toBeInTheDocument();});
 it("keeps service requests read-only when the client cannot be managed",()=>{render(<LinkedServicesReview baseline={baseline} readOnly/>);expect(screen.getByLabelText("Services budget owner")).toBeDisabled();expect(screen.queryByRole("button",{name:"Create linked services request"})).toBeNull();expect(state.rpc).not.toHaveBeenCalled();});
});
