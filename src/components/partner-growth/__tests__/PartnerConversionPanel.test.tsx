import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PartnerConversionPanel, conversionPreflight, legalIdentityComplete } from "@/components/partner-growth/PartnerConversionPanel";
import type { PartnerProspect } from "@/hooks/usePartnerGrowth";
import type { ActivationPlan } from "@/hooks/usePartnerActivation";

const mock = vi.hoisted(()=>({ rpc: vi.fn(), from:vi.fn() }));
vi.mock("@/integrations/supabase/client",()=>({ supabase:mock }));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock("@/components/partner-growth/PartnerInvitationPanel",()=>({PartnerInvitationPanel:()=>null}));

const p = (stage="Signed", model="CMSC", converted_partner_id:null|string=null) => ({
  id:"prospect1", company_name:"Example Connector", country:"PT",
  recruitment_stage:stage,proposed_partner_type:model,converted_partner_id,
  signed_verified_by:stage==="Signed"?"admin":null,
  signed_verified_at:stage==="Signed"?"2026-10-10T14:00:00Z":null,
  agreement_reference:stage==="Signed"?"SIGNED-2026":null,
  agreement_signed_on:stage==="Signed"?"2026-10-10":null,
}) as unknown as PartnerProspect;

const approvedPlan = () => ({
  target_model:"CMSC", legal_review_status:"approved",legal_review_reference:"LEGAL-2026",
  legal_reviewed_by:"admin", legal_reviewed_at:"2026-10-10T14:10:00Z",
  readiness_status:"ready_for_handoff", handoff_approved_by:"admin",
  handoff_approved_at:"2026-10-10T14:15:00Z", hq_activation_owner:"admin",
  kickoff_objective:"Introduce product to customer",first_value_milestone:"First qualified referral",
}) as ActivationPlan;

function mount(props?:{prospect?:PartnerProspect,plan?:ActivationPlan|null,isAdmin?:boolean,contactsCount?:number}) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<MemoryRouter><QueryClientProvider client={client}>
    <PartnerConversionPanel prospect={props?.prospect??p()} plan={props?.plan===undefined?approvedPlan():props.plan}
      isAdmin={props?.isAdmin??true} contactsCount={props?.contactsCount??1}/>
  </QueryClientProvider></MemoryRouter>);
}

beforeEach(()=>{cleanup();vi.clearAllMocks();mock.rpc.mockResolvedValue({data:"11111111-1111-4111-8111-111111111111",error:null});});

describe("4B1 conversion preflight",()=>{
  it("blocks unsigned candidates and missing approvals",()=>{
    expect(conversionPreflight(p("Identified"),null,0).length).toBeGreaterThan(3);
  });
  it("blocks Strategic Alliance specialized flow",()=>{
    const a=approvedPlan();a.target_model="Strategic Alliance";
    expect(conversionPreflight(p("Signed","Strategic Alliance"),a,1)).toContain("Strategic Alliances require a dedicated approval pathway");
  });
  it("requires all legal identity parts",()=>{
    expect(legalIdentityComplete({legal_name:"Example PLC",registration_number:"REG-X",registered_address:"Lisbon Street 123",signatory_name:"John Doe"})).toBe(true);
    expect(legalIdentityComplete({legal_name:"Example PLC",registration_number:"",registered_address:"Lisbon Street 123",signatory_name:"John Doe"})).toBe(false);
  });
});

describe("4B1 conversion UI",()=>{
  it("keeps conversion disabled until handoff approved",()=>{
    mount({plan:null});
    expect(screen.getByRole("button",{name:/prepare conversion/i})).toBeDisabled();
    expect(screen.getByText(/handoff has not been approved/i)).toBeInTheDocument();
  });
  it("HQ Standard cannot initiate conversion",()=>{
    mount({isAdmin:false});
    expect(screen.queryByRole("button",{name:/prepare conversion/i})).not.toBeInTheDocument();
    expect(screen.getByText(/Only HQ Admin/i)).toBeInTheDocument();
  });
  it("does not permit confirming without validated identity and explicit acknowledgement",async()=>{
    mount();
    fireEvent.click(screen.getByRole("button",{name:/prepare conversion/i}));
    expect(screen.getByRole("button",{name:"Convert to Official Partner"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Registered legal name"),{target:{value:"Example PLC"}});
    fireEvent.change(screen.getByLabelText("Business registration number"),{target:{value:"REG-X"}});
    fireEvent.change(screen.getByLabelText("Registered company address"),{target:{value:"Lisbon Street 123"}});
    fireEvent.change(screen.getByLabelText("Authorized signatory"),{target:{value:"John Doe"}});
    expect(screen.getByRole("button",{name:"Convert to Official Partner"})).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Confirm verified legal identity and no automatic access"));
    expect(screen.getByRole("button",{name:"Convert to Official Partner"})).toBeEnabled();
  });
  it("calls the single protected conversion RPC with checked data",async()=>{
    mount();
    fireEvent.click(screen.getByRole("button",{name:/prepare conversion/i}));
    fireEvent.change(screen.getByLabelText("Registered legal name"),{target:{value:"Example PLC"}});
    fireEvent.change(screen.getByLabelText("Business registration number"),{target:{value:"REG-X"}});
    fireEvent.change(screen.getByLabelText("Registered company address"),{target:{value:"Lisbon Street 123"}});
    fireEvent.change(screen.getByLabelText("Authorized signatory"),{target:{value:"John Doe"}});
    fireEvent.click(screen.getByLabelText("Confirm verified legal identity and no automatic access"));
    fireEvent.click(screen.getByRole("button",{name:"Convert to Official Partner"}));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("pg_convert_prospect",{
      p_prospect_id:"prospect1",p_legal_name:"Example PLC",p_registration_number:"REG-X",
      p_registered_address:"Lisbon Street 123",p_signatory_name:"John Doe",p_confirmed:true,
    }));
  });
  it("shows linked operational partner without another conversion button",()=>{
    mount({prospect:p("Signed","CMSC","11111111-1111-4111-8111-111111111111")});
    expect(screen.getByText("Official Partner Created")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:/Open operational partner/})).toHaveAttribute("href","/partners/11111111-1111-4111-8111-111111111111");
    expect(screen.queryByRole("button",{name:/prepare conversion/i})).not.toBeInTheDocument();
  });
});
