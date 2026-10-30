import {useState} from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,it,expect} from "vitest";
import {AdditionCommercialTerms} from "./AdditionCommercialTerms";
import {initialAdditionCommercial} from "@/lib/commercial-additions";
import {additionPaymentText} from "@/lib/commercial-addition-terms";
const line={code:"WEB",label:"WEB",quantity:1,ruleCodes:[],kind:"web" as const,annual:240,oneTime:0,dueNow:240,referenceAnnual:240,referenceUnitPrice:20,unitPeriod:"month" as const};
function Harness(){const [value,setValue]=useState(initialAdditionCommercial("2026-10-30"));return <><AdditionCommercialTerms value={value} lines={[line]} isHQ maxDiscount={100} onChange={setValue}/><output aria-label="adjustments">{JSON.stringify(value.adjustments)}</output></>;}
afterEach(cleanup);
describe("Explicit discount scope",()=>{
 it("does not turn an unresolved period or price basis into a zero price",()=>{
   render(<AdditionCommercialTerms value={initialAdditionCommercial("2026-10-30")} lines={[{...line,dueNow:0,annual:0,referenceUnitPrice:0}]} isHQ maxDiscount={100} onChange={()=>{}} priceBasisReady={false} periodReady={false}/>);
   expect(screen.getByText("Awaiting period / price basis")).toBeInTheDocument();
   expect(screen.queryByText(/€0[.,]00/)).toBeNull();
 });
 it("keeps a known annual tariff visible while the purchase period is unresolved",()=>{
   render(<AdditionCommercialTerms value={initialAdditionCommercial("2026-10-30")} lines={[line]} isHQ maxDiscount={100} onChange={()=>{}} periodReady={false}/>);
   expect(screen.getByText("Awaiting period / price basis")).toBeInTheDocument();
   expect(screen.getByText(/Annual increase: €240.00/)).toBeInTheDocument();
 });
 it("does not assume credit or an invoice for an unchosen payment condition",()=>{const c=initialAdditionCommercial("2026-10-30");expect(additionPaymentText(c.payment,"EN")).toBe("Payment and activation conditions have not been agreed yet.");expect(additionPaymentText(c.payment,"PT")).not.toContain("crédito");});
 it("offers the initial period without silently offering annual renewals",()=>{render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Offer this period only"}));expect(JSON.parse(screen.getByLabelText("adjustments").textContent!).WEB).toMatchObject({initialDiscountPct:100,renewalDiscountPct:0});});
 it("requires explicit confirmation to offer future renewals",()=>{render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Offer including renewals…"}));expect(screen.getByLabelText("adjustments")).toHaveTextContent("{}");fireEvent.click(screen.getByRole("button",{name:"Confirm offer including renewals"}));expect(JSON.parse(screen.getByLabelText("adjustments").textContent!).WEB.renewalDiscountPct).toBe(100);});
 it("returns cleanly to catalogue when a discount is removed",()=>{render(<Harness/>);const input=screen.getByLabelText("Initial discount (%)");fireEvent.change(input,{target:{value:"5"}});expect(screen.getByLabelText("Commercial justification / agreement")).toBeInTheDocument();fireEvent.change(input,{target:{value:"0"}});expect(screen.getByLabelText("adjustments")).toHaveTextContent("{}");expect(screen.queryByLabelText("Commercial justification / agreement")).toBeNull();});
});
