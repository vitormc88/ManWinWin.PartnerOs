import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,it,expect,vi} from "vitest";
vi.mock("./CommercialReviewDialog",()=>({CommercialReviewDialog:()=> <div>Scoped transition review</div>}));
vi.mock("./CommercialAdditionDialog",()=>({CommercialAdditionDialog:()=> <div>Incremental basket</div>}));
import {CreateProposalDialog,type CommercialContext} from "./CreateProposalDialog";
afterEach(cleanup);
describe("Existing customer proposal routing",()=>{
 it.each(["upgrade_license","change_hosting","other"] as const)("routes %s to review instead of new-license pricing",mode=>{
  render(<CreateProposalDialog open onOpenChange={()=>{}} defaultClientName="Existing customer" proposalSource={{source_type:"client",client_id:"c",license_id:"l",contract_id:"k",partner_uuid:null,deal_id:null,renewal_id:null}} commercialContext={{mode,label:mode} as CommercialContext}/>);
  expect(screen.getByText("Scoped transition review")).toBeInTheDocument();expect(screen.queryByText("Compare KeepIT vs UseIT")).toBeNull();
 });
 it.each(["add_users","add_modules","add_plugins"] as const)("keeps %s in the shared incremental basket",mode=>{
  render(<CreateProposalDialog open onOpenChange={()=>{}} defaultClientName="Existing customer" proposalSource={{source_type:"client",client_id:"c",license_id:"l",contract_id:"k",partner_uuid:null,deal_id:null,renewal_id:null}} commercialContext={{mode,label:mode} as CommercialContext}/>);
  expect(screen.getByText("Incremental basket")).toBeInTheDocument();
 });
});
