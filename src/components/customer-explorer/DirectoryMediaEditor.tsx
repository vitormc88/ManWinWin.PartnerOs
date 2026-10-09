import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {clientKey,type DirectoryClient} from '@/lib/customer-directory';
import type {ExplorerCaseStudy} from '@/lib/customer-explorer';
import {CustomerLogo} from './CustomerLogo';

export type MediaPatch={logo_path?:string|null;logo_dark?:boolean;case_study?:ExplorerCaseStudy|null};
const labels:Record<keyof ExplorerCaseStudy,string>={title:'Title',url:'Public case-study URL',language:'Language',scope:'Customer / project scope',problem:'Challenge',approach:'Approach',evidence:'Published evidence',limitation:'Limitations / context',reviewed_at:'Source review date'};
const blank:ExplorerCaseStudy={title:'',url:'',language:'EN',scope:'',problem:'',approach:'',evidence:'',limitation:'',reviewed_at:''};
export function DirectoryMediaEditor({client,onSave}:{client:DirectoryClient;onSave:(client:DirectoryClient,patch:MediaPatch)=>Promise<void>}){
 const [study,setStudy]=useState<ExplorerCaseStudy>(client.case_study||blank);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{setStudy(client.case_study||blank);setMessage('');setError('');},[client.id,client.case_study]);
 const save=async(patch:MediaPatch)=>{setBusy(true);setError('');setMessage('');try{await onSave(client,patch);setMessage('Changes saved to the customer directory.');}catch(e){setError(e instanceof Error?e.message:'Unable to save media.');}finally{setBusy(false);}};
 const upload=async(file?:File)=>{
  if(!file)return;setBusy(true);setError('');setMessage('');
  try{
   const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];
   if(!ext||file.size>256000)throw new Error('Use PNG, JPEG or WebP up to 256 KB.');
   const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
   const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
   const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
   if(!(ext==='png'?png:ext==='jpg'?jpg:webp))throw new Error('Image contents do not match the selected format.');
   const path=`${clientKey(client.client_id)}/${crypto.randomUUID()}.${ext}`;
   const {error:uploadError}=await supabase.storage.from('customer-explorer-logos').upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError)throw new Error(uploadError.message);
   await onSave(client,{logo_path:path});setMessage('Logo uploaded and saved.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to upload logo.');}finally{setBusy(false);}
 };
 return <section className="rounded-xl border p-4 space-y-3" aria-label="Customer media administration"><h2 className="font-semibold">Logo &amp; public case study</h2><p className="text-sm">Use a confirmed company logo and a reviewed public article for this exact customer. No reference-call availability is implied.</p><CustomerLogo client={client}/>
 <label className="block">Upload confirmed logo<input aria-label="Upload confirmed logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label>
 <label className="flex gap-2"><input type="checkbox" checked={!!client.logo_dark} disabled={busy} onChange={e=>save({logo_dark:e.target.checked})}/>Dark background for white logo</label>
 <button type="button" disabled={busy||!client.logo_path} onClick={()=>save({logo_path:null})}>Remove logo from directory</button>
 <p className="text-xs">Removal unlinks the file; retained private files are not exposed to partners.</p>
 <div className="grid gap-3 md:grid-cols-2">{(Object.keys(labels) as (keyof ExplorerCaseStudy)[]).map(key=><label className="block text-sm" key={key}>{labels[key]}{['problem','approach','evidence','limitation','scope'].includes(key)?<textarea aria-label={labels[key]} className="block w-full rounded border bg-background p-2" maxLength={2000} value={study[key]} onChange={e=>setStudy({...study,[key]:e.target.value})}/>:<input aria-label={labels[key]} className="block w-full rounded border bg-background p-2" type={key==='url'?'url':'text'} placeholder={key==='reviewed_at'?'YYYY-MM-DD':undefined} maxLength={2000} value={study[key]} onChange={e=>setStudy({...study,[key]:e.target.value})}/>}</label>)}</div>
 <button type="button" disabled={busy} onClick={()=>save({case_study:study})}>Save reviewed case study</button>{' '}<button type="button" disabled={busy||!client.case_study} onClick={()=>save({case_study:null})}>Remove case study</button>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
