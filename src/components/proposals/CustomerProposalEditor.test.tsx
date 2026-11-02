import { useState } from "react";
import { describe,it,expect,vi,afterEach } from "vitest";
import { render,screen,fireEvent,cleanup } from "@testing-library/react";
import { CustomerProposalEditor } from "./CustomerProposalEditor";
import { newCustomerProposal } from "@/lib/customer-proposal-editor";
import { calculateAddition,type AdditionBaseline } from "@/lib/commercial-additions";
import type {PricingRule} from "@/types/proposal";
const b:AdditionBaseline={clientId:"c",clientName:"SONACA — synthetic",licenseId:"l",contractId:"k",partnerId:null,family:"Professional",model:null,plan:1,deployment:"saas",backoffice:1,web:3,owned:[],renewalDate:"2027-11-21",priceTable:null,recordedAnnual:1416,satActive:true};
const rules=[{code:"impl_session",unit_price:360,unit_type:"one-time",active:true,currency:"EUR"}] as PricingRule[];
const save=vi.fn(),download=vi.fn();
function Demo(){const [selection,change]=useState(newCustomerProposal(b,"2026-11-01")),[step,setStep]=useState(0),[notes,setNotes]=useState("");const quote=calculateAddition(b,selection,rules);return <CustomerProposalEditor open close={()=>{}} baseline={b} selection={selection} change={change} quote={quote} draft={{schema:"commercial_addition_v1",action:"add_modules",baseline:b,selection,rules,quote}} rules={rules} blockers={quote.blockers} isHQ maxDiscount={100} maxServicesDiscount={100} busy={false} canSave step={step} setStep={setStep} notes={notes} setNotes={setNotes} terms="100% upfront" save={save} download={download}/>;}
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("Customer proposal experience",()=>{
 it("clears catalogue approval when delivery changes and removes renewal review for services only",()=>{
  render(<Demo/>);fireEvent.click(screen.getByRole("button",{name:"2. Services"}));fireEvent.click(screen.getByRole("button",{name:"+ Remote session"}));
  fireEvent.change(screen.getByLabelText("Delivery"),{target:{value:"onsite"}});
  expect(screen.getByLabelText("€ / unit")).toHaveValue(null);expect(screen.getByLabelText(/Approved price reference/)).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"4. Review & generate"}));expect(screen.queryByText("Existing annual renewal")).not.toBeInTheDocument();
 });
 it("makes Professional modules and plugins available and explains the missing tariff at selection",()=>{
  render(<Demo/>);const stock=screen.getByRole("checkbox",{name:"Stock Management"});expect(stock).toBeEnabled();fireEvent.click(stock);
  expect(screen.getByLabelText("Stock Management · €/year")).toBeVisible();fireEvent.change(screen.getByLabelText("Stock Management · €/year"),{target:{value:"400"}});fireEvent.change(screen.getByLabelText("Price reference"),{target:{value:"Approved HQ tariff"}});
  expect(screen.getByRole("checkbox",{name:"Workflow"})).toBeEnabled();expect(screen.queryByText(/reviews outstanding/)).not.toBeInTheDocument();
 });
 it("combines remote training and its 25% discount in the same proposal without any linked request",()=>{
  render(<Demo/>);fireEvent.click(screen.getByRole("button",{name:"2. Services"}));fireEvent.click(screen.getByRole("button",{name:"+ Remote session"}));fireEvent.change(screen.getByLabelText("Quantity"),{target:{value:"2"}});fireEvent.change(screen.getByLabelText("Services discount (%)"),{target:{value:"25"}});
  expect(screen.getByRole("complementary")).toHaveTextContent("€540.00");fireEvent.click(screen.getByRole("button",{name:"4. Review & generate"}));expect(screen.getByRole("table")).toHaveTextContent("Remote training session");expect(screen.queryByText(/linked services budget/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Save Draft"}));expect(save).toHaveBeenCalledOnce();
 });
 it("does not generate a document with a missing approved component price",()=>{
  render(<Demo/>);fireEvent.click(screen.getByRole("checkbox",{name:"Stock Management"}));fireEvent.click(screen.getByRole("button",{name:"4. Review & generate"}));fireEvent.click(screen.getByRole("button",{name:"Save & download PDF"}));expect(download).not.toHaveBeenCalled();expect(screen.getByRole("status")).toHaveTextContent("approved annual price");
 });
});
