import { beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { PartnerInvitationPanel,initialInvitationRole } from "@/components/partner-growth/PartnerInvitationPanel";
import { PartnerReferralWorkspace,isPartnerTrainee } from "@/components/partner-growth/PartnerReferralWorkspace";

const mocks=vi.hoisted(()=>({
  contacts:[{id:"contact-1",name:"Partner Contact",email:"partner@example.invalid"}],
  roles:["partner_connector"],
  profile:{partner_id:"p1"},
  leads:[],
  invoke:vi.fn().mockResolvedValue({data:{success:true},error:null}),
  rpc:vi.fn().mockResolvedValue({data:"lead-1",error:null}),
}));
vi.mock("@/hooks/usePartnerGrowth",()=>({useProspectContacts:()=>({data:mocks.contacts})}));
vi.mock("@/hooks/useIncomingLeads",()=>({useIncomingLeads:()=>({data:mocks.leads,isLoading:false})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({roles:mocks.roles,profile:mocks.profile})}));
vi.mock("@/integrations/supabase/client",()=>({
  supabase:{
    functions:{invoke:mocks.invoke},
    rpc:mocks.rpc,
    from:()=>({select:()=>({eq:()=>Promise.resolve({data:[],error:null})})}),
  },
}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));

function mount(element:React.ReactElement){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.roles=["partner_connector"];mocks.invoke.mockResolvedValue({data:{success:true},error:null});mocks.rpc.mockResolvedValue({data:"lead-1",error:null});});
const signed={id:"pro-1",company_name:"Example Connector",converted_partner_id:"p1",proposed_partner_type:"CMSC"} as any;

describe("Partner Growth 4B2 least privilege",()=>{
 it("does not confuse CMSC with a reseller/implementer",()=>{
  expect(initialInvitationRole.CMSC.role).toBe("partner_connector");
  expect(initialInvitationRole.CMAR.role).toBe("partner_reseller_trainee");
  expect(initialInvitationRole.CMAI.role).toBe("partner_implementer_trainee");
 });
 it("redirects only new probationary partner roles to referral workspace",()=>{
  expect(isPartnerTrainee(["partner_connector"])).toBe(true);
  expect(isPartnerTrainee(["partner_sales"])).toBe(false);
 });
 it("HQ Standard cannot send invitation",()=>{
  mount(<PartnerInvitationPanel prospect={signed} isAdmin={false}/>);
  expect(screen.queryByRole("button",{name:/Send individual invitation/})).not.toBeInTheDocument();
 });
 it("HQ Admin must select a named contact and explicitly authorize the invitation",async()=>{
  mount(<PartnerInvitationPanel prospect={signed} isAdmin/>);
  expect(screen.getByRole("button",{name:/Send individual invitation/})).toBeDisabled();
  fireEvent.click(screen.getByRole("combobox",{name:/Verified prospect contact/}));
  fireEvent.click(screen.getByText(/Partner Contact · partner@example.invalid/));
  expect(screen.getByRole("button",{name:/Send individual invitation/})).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I authorize this specific partner invitation/));
  fireEvent.click(screen.getByRole("button",{name:/Send individual invitation/}));
  await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledWith("partner-growth-invite",{
   body:{prospect_id:"pro-1",contact_id:"contact-1",confirmed:true},
  }));
 });
 it("referral form never submits before required information is present",()=>{
  mount(<PartnerReferralWorkspace/>);
  expect(screen.getByRole("button",{name:/Submit to HQ/})).toBeDisabled();
 });
 it("submits an owned HQ-routed referral through the restricted RPC only",async()=>{
  mount(<PartnerReferralWorkspace/>);
  fireEvent.change(screen.getByLabelText(/Customer company/),{target:{value:"Potential Customer"}});
  fireEvent.change(screen.getByLabelText(/Country code/),{target:{value:"PT"}});
  fireEvent.change(screen.getByLabelText(/Customer contact/),{target:{value:"Buyer"}});
  fireEvent.change(screen.getByLabelText(/Customer email/),{target:{value:"buyer@example.invalid"}});
  fireEvent.click(screen.getByRole("button",{name:/Submit to HQ/}));
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith("pg_submit_partner_referral",{
   p_company_name:"Potential Customer",p_contact_name:"Buyer",
   p_email:"buyer@example.invalid",p_country:"PT",p_notes:null,
  }));
 });
});
