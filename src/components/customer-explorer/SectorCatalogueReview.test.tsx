import { afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { SectorCatalogueReview } from './SectorCatalogueReview';
import { validateDirectoryInput } from '@/lib/customer-directory';
import type { DirectoryClient } from '@/lib/customer-directory';
afterEach(cleanup);
const rows=[{id:'1',client_id:'0042',name:'Example',country:'PT',sector:'Packaging & Paper',source_kind:'hq',evidence_status:'unconfirmed'}] as DirectoryClient[];
describe('HQ sector proposals',()=>{
 it('shows affected records without an apply/merge action',()=>{render(<SectorCatalogueReview rows={rows}/>);fireEvent.click(screen.getByRole('button',{name:'Review sector catalogue & proposals'}));expect(screen.getByText(/No proposal below has been applied/)).toBeInTheDocument();fireEvent.change(screen.getByRole('combobox'),{target:{value:'Packaging & Paper'}});expect(screen.getByText(/0042 · Example/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:/Apply|Merge/})).not.toBeInTheDocument()});
 it('blocks imported uncontrolled values before any save',()=>{expect(()=>validateDirectoryInput({client_id:'0042',name:'Example',country:'PT',sector:'Custom invented sector',active:null,visible:true,evidence_status:'unconfirmed',evidence_note:null})).toThrow('shared catalogue')});
});
