import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {PDFDocument} from 'pdf-lib';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {exportSelection,exportSummary,exportFilename,customerWebsite,reviewedExportStudy,DEFAULT_EXPORT_OPTIONS} from '@/lib/customer-export';
import {CustomerExportDialog} from '@/components/customer-explorer/CustomerExportDialog';
import {createCustomerPdf} from '@/lib/customer-export-pdf';
import * as pdfModule from '@/lib/customer-export-pdf';
import type {ExplorerClient} from '@/lib/customer-explorer';

vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>({download:vi.fn().mockResolvedValue({data:null,error:new Error('Denied')})})}}}));
const filters={search:'',sector:'',region:'',country:'',includeHistorical:false};
const row:ExplorerClient={id:'fixture-one',name:'Novarroz',country:'PT',sector:'Food & Beverage',active:true,partner:'INTERNAL PARTNER',contact_name:'PRIVATE CONTACT',contact_email:'private@example.com',website_url:'https://www.novarroz.pt/',website_source:'https://www.novarroz.pt/',website_reviewed_at:'2026-10-10'};
const assets=async(path:string)=>new Uint8Array(readFileSync(resolve('public',path.replace(/^\//,''))));
const out=resolve('../output/pdf');
describe('Customer PDF export',()=>{
 beforeEach(()=>cleanup());
 it('filters hidden and historical customers and selects only exact IDs',()=>{
  const rows=[row,{...row,id:'hidden',visible:false},{...row,id:'historical',active:false}];
  expect(exportSelection(rows,filters).map(r=>r.id)).toEqual(['fixture-one']);
  expect(exportSelection(rows,filters,new Set(['hidden']))).toHaveLength(0);
  expect(exportSelection(rows,{...filters,includeHistorical:true})).toHaveLength(2);
 });
 it('requires reviewed complete case studies and exact website identity',()=>{
  expect(reviewedExportStudy({...row,case_study:{url:'https://www.manwinwin.com/article'} as never})).toBeNull();
  expect(customerWebsite(row)).toBe('https://www.novarroz.pt/');
  expect(customerWebsite({...row,website_reviewed_at:null})).toBeNull();
  expect(customerWebsite({...row,website_url:'https://user:secret@example.com/'})).toBeNull();
  expect(customerWebsite({...row,website_url:'javascript:alert(1)'})).toBeNull();
  expect(exportSummary([row]).websites).toBe(1);
 });
 it('generates a safe date-stamped filename',()=>{
  expect(exportFilename({...filters,sector:'Healthcare / Pharma'},new Date('2026-10-09'))).toBe('ManWinWin_Healthcare-Pharma_2026-10-09.pdf');
 });
 it('supports defaults and explicit customer selection, not just the first 12 cards',()=>{
  const rows=Array.from({length:30},(_,i)=>({...row,id:`row-${i}`,name:`Customer ${i}`}));
  render(<CustomerExportDialog rows={rows} filters={filters} prepare={vi.fn()} validate={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByLabelText('Include map')).not.toBeChecked();
  expect(screen.getByLabelText('Include available logos (0)')).toBeChecked();
  expect(screen.getByLabelText('Add reviewed case studies (0)')).not.toBeChecked();
  expect(screen.getByRole('status')).toHaveTextContent('30 customers');
  fireEvent.click(screen.getByLabelText('Choose customers'));
  expect(screen.getByText('Download PDF')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Customer 29',{exact:true}));
  expect(screen.getByRole('status')).toHaveTextContent('1 customers');
 });
 it('blocks generation when the access check rejects',async()=>{
  const prepare=vi.fn().mockRejectedValue(new Error('Access revoked')),validate=vi.fn(),close=vi.fn();
  render(<CustomerExportDialog rows={[row]} filters={filters} prepare={prepare} validate={validate} onClose={close}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Access revoked');
  expect(validate).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 });
 it('blocks a stale selection after a customer is hidden',async()=>{
  render(<CustomerExportDialog rows={[row,{...row,id:'removed'}]} filters={filters} prepare={vi.fn().mockResolvedValue([row])} validate={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  expect(await screen.findByRole('alert')).toHaveTextContent('selection changed');
 });
 it('does not download if permission is revoked while the PDF is being generated',async()=>{
  const spy=vi.spyOn(pdfModule,'createCustomerPdf').mockResolvedValue(new Uint8Array([1,2]));
  const validate=vi.fn().mockRejectedValue(new Error('Visibility changed during export')),close=vi.fn();
  render(<CustomerExportDialog rows={[row]} filters={filters} prepare={vi.fn().mockResolvedValue([row])} validate={validate} onClose={close}/>);
  fireEvent.click(screen.getByText('Download PDF'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Visibility changed');
  expect(validate).toHaveBeenCalledWith(['fixture-one']);expect(close).not.toHaveBeenCalled();spy.mockRestore();
 });
 it('writes a small searchable PDF with map and reviewed public case study',async()=>{
  const sample={...row,case_study:{title:'Structured maintenance',url:'https://www.manwinwin.com/case-study-novarroz',language:'EN',scope:'Portugal packaging operations',problem:'Organise maintenance records.',approach:'A phased rollout and mobile reporting.',evidence:'The public article describes team adoption.',limitation:'Qualitative account, not independently audited performance.',reviewed_at:'2026-10-09'}};
  const bytes=await createCustomerPdf([sample,{...row,id:'two',name:'Quinta dos Açores'}],{...DEFAULT_EXPORT_OPTIONS,map:true,caseStudies:true},filters,new Date('2026-10-09'),assets);
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPages()[0].node.Annots()?.size()).toBeGreaterThan(0);
  mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'Customer_Export_TEST_Small.pdf'),bytes);
 },30_000);
 it('paginates a large selection with missing media and long Unicode names',async()=>{
  const rows=Array.from({length:100},(_,i)=>({...row,id:`large-${i}`,name:i===2?'Águas & Serviços - Ελληνική εταιρεία - A long customer name requiring wrapping without clipping':`TEST CUSTOMER ${i+1}`,sector:i%3===0?null:row.sector}));
  const bytes=await createCustomerPdf(rows,{map:false,logos:false,websites:false,caseStudies:false},filters,new Date('2026-10-09'),assets);
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(5);
  expect(pdf.getPages().every(p=>(p.node.Annots()?.size()||0)===0)).toBe(true);
  writeFileSync(resolve(out,'Customer_Export_TEST_Large.pdf'),bytes);
 },30_000);
});
