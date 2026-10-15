import { afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import KnowledgeBase from '@/pages/KnowledgeBase';
const state=vi.hoisted(()=>({error:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({isAdmin:false,user:null,profile:null,roles:[]})}));
vi.mock('@/hooks/useKnowledgeBase',()=>({useSaveResourceReview:()=>({}),useCategories:()=>({data:[],isLoading:false}),useDocuments:()=>({data:[{id:'1',title:'Brochure EN 2026',file_name:'brochure-en-2026.pdf',file_type:'pdf',tags:[]},{id:'2',title:'Price list PT 2023',file_name:'prices-pt-2023.pdf',file_type:'pdf',tags:[]}],isLoading:false,isError:state.error,refetch:vi.fn()}),useCreateCategory:()=>({}),useUpdateCategory:()=>({}),useDeleteCategory:()=>({}),useCreateDocument:()=>({}),useUpdateDocument:()=>({}),useDeleteDocument:()=>({})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
afterEach(()=>{cleanup();state.error=false});
describe('Resource discovery',()=>{
 it('filters by language/year hints and keeps approval caveat visible',()=>{render(<KnowledgeBase/>);fireEvent.change(screen.getByRole('combobox',{name:'Resource language hint'}),{target:{value:'en'}});expect(screen.getByRole('button',{name:'Open resource Brochure EN 2026'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Open resource Price list PT 2023'})).not.toBeInTheDocument();expect(screen.getByText(/not content review/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Clear resource filters'}));fireEvent.change(screen.getByRole('combobox',{name:'Year mentioned in resource name'}),{target:{value:'2023'}});expect(screen.getByRole('button',{name:'Open resource Price list PT 2023'})).toBeInTheDocument()});
 it('searches filenames without renaming or deleting source documents',()=>{render(<KnowledgeBase/>);fireEvent.change(screen.getByRole('textbox',{name:'Search resources'}),{target:{value:'brochure-en-2026.pdf'}});expect(screen.getByRole('button',{name:'Open resource Brochure EN 2026'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Open resource Price list PT 2023'})).not.toBeInTheDocument()});
 it('offers recovery instead of claiming resources do not exist',()=>{state.error=true;render(<KnowledgeBase/>);expect(screen.getByRole('alert')).toHaveTextContent('does not mean the category is empty');expect(screen.getByRole('button',{name:'Retry resources'})).toBeInTheDocument()});
});
