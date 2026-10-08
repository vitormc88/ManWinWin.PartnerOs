import { describe, expect, it } from "vitest";
import { countryCode, countryGroups, countryName, filterExplorerClients, requestEmail, type ExplorerClient } from "../customer-explorer";
const rows: ExplorerClient[] = [
  {id:"1",name:"INFOMED",country:"RO",sector:"Healthcare & Pharma",active:true,partner:"Dasstec",contact_name:"George",contact_email:"office@example.com"},
  {id:"2",name:"PFIZER",country:"ROMANIA",sector:"Healthcare & Pharma",active:false,partner:"Dasstec",contact_name:"George",contact_email:"office@example.com"},
  {id:"3",name:"WATSONS",country:"PH",sector:"Healthcare & Pharma",active:true,partner:"FITC",contact_name:"Ivan",contact_email:"ivan@example.com"},
  {id:"4",name:"Example",country:"KSA",sector:null,active:true,partner:"ManWinWin",contact_name:"Customer Care",contact_email:null},
];
const filters = {search:"",sector:"",region:"",country:"",includeHistorical:false};
describe("Customer Explorer",()=>{
  it("normalizes country aliases before counting or filtering",()=>{
    expect(countryCode("Saudi Arabia")).toBe("SA");
    expect(countryCode(" KSA ")).toBe("SA");
    expect(countryName("ROMANIA")).toBe("Romania");
    expect(countryCode("Brazil")).toBe("BR");
    expect(countryName("US")).toBe("United States of America");
    expect(countryGroups(rows).find(c=>c.code==="RO")?.count).toBe(2);
  });
  it("finds the Romanian healthcare contact using sector and country",()=>{
    const found=filterExplorerClients(rows,{...filters,sector:"Healthcare & Pharma",country:"RO"});
    expect(found.map(r=>r.name)).toEqual(["INFOMED"]);
    expect(found[0].contact_name).toBe("George");
  });
  it("distinguishes historical customers and searches without case sensitivity",()=>{
    expect(filterExplorerClients(rows,{...filters,includeHistorical:true,search:"pfizer"})).toHaveLength(1);
    expect(filterExplorerClients(rows,{...filters,search:"pfizer"})).toHaveLength(0);
    expect(filterExplorerClients(rows,{...filters,region:"APAC"}).map(r=>r.name)).toEqual(["WATSONS"]);
  });
  it("keeps unknown sectors discoverable without inventing a classification",()=>{
    expect(filterExplorerClients(rows,{...filters,sector:"Sector to confirm"}).map(r=>r.name)).toEqual(["Example"]);
  });
  it("prepares an encoded draft with the partner recipient, never sends it",()=>{
    const uri=requestEmail(rows[0],"A hospital in Peru & a new project");
    const url=new URL(uri);
    expect(decodeURIComponent(url.pathname)).toBe("office@example.com");
    expect(url.searchParams.get("body")).toContain("A hospital in Peru & a new project");
    expect(url.searchParams.get("subject")).toContain("INFOMED (Romania)");
  });
  it("routes missing partner contacts to Customer Care",()=>{
    expect(requestEmail(rows[3],"")).toMatch(/^mailto:customercare%40manwinwin.com/);
  });
  it("includes unconfirmed statuses without treating them as historical",()=>{
    const unconfirmed={...rows[3],id:"5",active:null};
    expect(filterExplorerClients([unconfirmed],filters)).toHaveLength(1);
  });
});
