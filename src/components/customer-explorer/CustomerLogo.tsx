import { useEffect, useState } from 'react';
import type { ExplorerClient } from '@/lib/customer-explorer';
import {supabase} from '@/integrations/supabase/client';
export function CustomerLogo({client}:{client:ExplorerClient}){
 const [failed,setFailed]=useState(false);
 const [privateUrl,setPrivateUrl]=useState<string>();
 useEffect(()=>{
  let cancelled=false,objectUrl:string|undefined;
  setPrivateUrl(undefined);setFailed(false);
  if(client.logo_path)supabase.storage.from('customer-explorer-logos').download(client.logo_path).then(({data,error})=>{
   if(cancelled||error||!data)return;
   objectUrl=URL.createObjectURL(data);setPrivateUrl(objectUrl);
  }).catch(()=>setFailed(true));
  return ()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[client.logo_path,client.logo_url]);
 const logoUrl=client.logo_path?privateUrl:client.logo_url;
 const initials=client.name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return <div className={`ce-client-logo ${client.logo_dark?'ce-client-logo-dark':''}`} title={logoUrl&&!failed?`${client.name} logo`:'Logo not supplied'}>
 {logoUrl&&!failed?<img src={logoUrl} alt={`${client.name} logo`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span aria-label={`Logo not supplied for ${client.name}`}>{initials}</span>}
 </div>;
}
