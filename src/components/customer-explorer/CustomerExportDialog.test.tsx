import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CustomerExportDialog } from "./CustomerExportDialog";
import type { ExplorerClient } from "@/lib/customer-explorer";
const state=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("@/lib/customer-export-pdf",()=>({createCustomerPdf:(...args:any[])=>state.create(...args)}));
const filters={search:'',sector:'',region:'',country:'',includeHistorical:false};
const rows=[{id:'test',name:'Test customer',country:'PT',active:true,visible:true}] as ExplorerClient[];
beforeEach(()=>{state.create.mockReset();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("Customer PDF download loading",()=>{
 it("does not lazily import the PDF module at download time",()=>{
  const source=readFileSync('src/components/customer-explorer/CustomerExportDialog.tsx','utf8');
  expect(source).toContain("import {createCustomerPdf} from '@/lib/customer-export-pdf'");
  expect(source).not.toContain("await import(");
 });
 it("uses a connected download link only after both visibility checks",async()=>{
  state.create.mockResolvedValue(new Uint8Array([1,2]));
  const order:string[]=[];
  const prepare=vi.fn(async()=>{order.push('prepare');return rows;});
  const validate=vi.fn(async()=>{order.push('validate');});
  const close=vi.fn();
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:test')});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
  let connected=false;
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){connected=this.isConnected;order.push('download');});
  render(<CustomerExportDialog rows={rows} filters={filters} prepare={prepare} validate={validate} onClose={close}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  await waitFor(()=>expect(close).toHaveBeenCalledOnce());
  expect(order).toEqual(['prepare','validate','download']);expect(connected).toBe(true);
  expect(document.querySelector('a[download]')).toBeNull();
 });
 it("offers an explicit reload for a module load failure",async()=>{
  state.create.mockRejectedValue(new TypeError('Importing a module script failed.'));
  const validate=vi.fn();
  render(<CustomerExportDialog rows={rows} filters={filters} prepare={async()=>rows} validate={validate} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the Explorer');
  expect(screen.getByText('Reload Explorer')).toBeEnabled();expect(validate).not.toHaveBeenCalled();
 });
 it("does not misclassify denied access as a loading failure",async()=>{
  render(<CustomerExportDialog rows={rows} filters={filters} prepare={async()=>{throw new Error('Access revoked');}} validate={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked');
  expect(screen.queryByText('Reload Explorer')).not.toBeInTheDocument();expect(state.create).not.toHaveBeenCalled();
 });
});
