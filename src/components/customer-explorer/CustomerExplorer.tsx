import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Search, ArrowUpRight, Mail, X, MapPin, Building2, RotateCcw, Layers, ChevronDown } from "lucide-react";
import { countryCode, countryGroups, countryName, filterExplorerClients, regionName, requestEmail, UNKNOWN_SECTOR, CUSTOMER_CARE_EMAIL, type ExplorerClient } from "@/lib/customer-explorer";
import "./customer-explorer.css";

type World = { features: { properties: { NAME: string; ISO_A2: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
const project = (lon: number, lat: number) => [(lon+180)*2.5, (83-lat)*2.5];
function mapPath(geometry: World["features"][number]["geometry"]) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][];
  return polys.map(poly => poly.map(ring => ring.map(([lon,lat],i) => {
    const [x,y] = project(lon,lat); return `${i?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ")+" Z").join(" ")).join(" ");
}
export function CustomerExplorer({ clients, preview = false, updatedAt, onRefresh }: { clients: ExplorerClient[]; preview?: boolean; updatedAt?: string; onRefresh?: () => void }) {
  const [search,setSearch] = useState("");
  const [sector,setSector] = useState("");
  const [region,setRegion] = useState("");
  const [country,setCountry] = useState("");
  const [historical,setHistorical] = useState(false);
  const [limit,setLimit] = useState(12);
  const [selected,setSelected] = useState<ExplorerClient|null>(null);
  const [context,setContext] = useState("");
  const [world,setWorld] = useState<World|null>(null);
  const [zoom,setZoom] = useState(1);
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => { let alive=true; fetch("/customer-explorer-world.geojson").then(r=>{if(!r.ok)throw new Error("Map unavailable");return r.json()}).then(d=>{if(alive)setWorld(d)}).catch(()=>{});return()=>{alive=false} },[]);
  useEffect(()=>setLimit(12),[search,sector,region,country,historical]);
  useEffect(()=>{
    if(!selected)return;
    const previous=document.activeElement as HTMLElement|null;
    const keydown=(e:KeyboardEvent)=>{
      if(e.key==="Escape")setSelected(null);
      if(e.key==="Tab"){
        const targets=modalRef.current?.querySelectorAll<HTMLElement>('button,textarea,a[href]');
        if(!targets?.length)return;
        const first=targets[0],last=targets[targets.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    };
    document.addEventListener("keydown",keydown);
    return()=>{document.removeEventListener("keydown",keydown);previous?.focus()};
  },[selected]);
  const sectors = useMemo(()=>[...new Set(clients.map(r=>r.sector||UNKNOWN_SECTOR))].sort(),[clients]);
  const regions = useMemo(()=>[...new Set(clients.map(r=>regionName(r.country)))].sort(),[clients]);
  const allCountries = useMemo(()=>countryGroups(clients).sort((a,b)=>a.name.localeCompare(b.name)),[clients]);
  const matches = useMemo(()=>filterExplorerClients(clients,{search,sector,region,country,includeHistorical:historical}),[clients,search,sector,region,country,historical]);
  const mapMatches = useMemo(()=>filterExplorerClients(clients,{search,sector,region,country:"",includeHistorical:historical}),[clients,search,sector,region,historical]);
  const groups = countryGroups(mapMatches);
  const resultCountries = countryGroups(matches);
  const focus=groups.find(g=>g.code===country);
  const center=focus?.lon!==undefined&&focus.lat!==undefined?project(focus.lon,focus.lat):[450,185];
  const viewWidth=900/zoom,viewHeight=370/zoom;
  const viewX=Math.max(0,Math.min(900-viewWidth,center[0]-viewWidth/2));
  const viewY=Math.max(0,Math.min(370-viewHeight,center[1]-viewHeight/2));
  const activeCount = matches.filter(r=>r.active === true).length;
  const historicalCount = matches.filter(r=>r.active === false).length;
  const unknownCount = matches.filter(r=>r.active === null).length;
  const reset = () => {setSearch("");setSector("");setRegion("");setCountry("");setHistorical(false)};
  const openRequest = (r:ExplorerClient) => {setContext("");setSelected(r)};
  return <div className="ce">
    <div className="ce-eyebrow"><span className="ce-live-dot"/> GLOBAL CUSTOMER NETWORK {preview&&<span className="ce-preview">LOCAL PREVIEW · SNAPSHOT</span>}</div>
    <div className="ce-heading"><div><h1>Experience without borders<span>.</span></h1><p>Find a customer in your sector. Connect with the person who knows their journey.</p></div><div className="ce-heading-icon"><Globe2 size={35}/></div></div>
    <div className="ce-guidance"><Building2 size={18}/><p>Explore the ManWinWin customer network. For project information or a possible reference, contact the responsible partner or Customer Care.</p></div>
    <div className="ce-toolbar">
      <label className="ce-search"><Search size={18}/><input aria-label="Search customers" placeholder="Search company, country or partner…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label className="ce-select"><span>SECTOR</span><select aria-label="Sector" value={sector} onChange={e=>setSector(e.target.value)}><option value="">All sectors</option>{sectors.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={13}/></label>
      <label className="ce-select"><span>REGION</span><select aria-label="Region" value={region} onChange={e=>{setRegion(e.target.value);setCountry("")}}><option value="">All regions</option>{regions.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={13}/></label>
      <label className="ce-select"><span>COUNTRY</span><select aria-label="Country" value={country} onChange={e=>setCountry(e.target.value)}><option value="">All countries</option>{allCountries.filter(c=>!region||c.region===region).map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select><ChevronDown size={13}/></label>
      <button className="ce-reset" onClick={reset} aria-label="Clear filters" title="Clear filters"><RotateCcw size={17}/></button>
    </div>
    <div className="ce-options"><label><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)}/> Include historical customers <span>({clients.filter(c=>c.active===false).length})</span></label><span>{preview?`Snapshot ${updatedAt||"8 Oct 2026"}`:"Updates automatically · every minute"}{onRefresh&&<button onClick={onRefresh}>Refresh</button>}</span></div>
    <section className="ce-map-panel" aria-label="Global customer map">
      <div className="ce-map-top"><div><Globe2 size={17}/><strong>Your next reference could be anywhere.</strong></div><span>Choose a country to explore its customers</span></div>
      <div className="ce-map-grid">
        <div className="ce-map-wrap"><div className="ce-map-zoom"><button aria-label="Zoom in map" onClick={()=>setZoom(v=>Math.min(4,v+1))} disabled={zoom===4}>+</button><button aria-label="Zoom out map" onClick={()=>setZoom(v=>Math.max(1,v-1))} disabled={zoom===1}>−</button><button onClick={()=>setZoom(1)}>World</button><span>{zoom}× · select a country to center</span></div><svg viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`} role="group" aria-label="World map. Country buttons are also available in the list.">
          <defs><pattern id="ce-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#d9e1e7"/></pattern></defs><rect width="900" height="370" fill="url(#ce-dots)"/>
          {world?.features.filter(f=>f.properties.NAME!=="Antarctica").map((f,i)=><path key={i} d={mapPath(f.geometry)} fill="#e8edf1" stroke="#fff" strokeWidth="0.8"/>)}
          {groups.filter(g=>g.lon!==undefined&&g.lat!==undefined).map(g=>{const [x,y]=project(g.lon!,g.lat!); const r=Math.min(21,9+Math.sqrt(g.count)*1.8)/zoom;return <g key={g.code} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`${g.name}, ${g.count} customers`} aria-pressed={country===g.code} onClick={()=>setCountry(country===g.code?"":g.code)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setCountry(country===g.code?"":g.code)}}} className={`ce-map-marker ${country===g.code?"selected":""}`}><title>{g.name}: {g.count} customers</title><circle r={r+5/zoom} className="ce-marker-halo"/><circle r={r} className="ce-marker-dot"/><text textAnchor="middle" dy={4/zoom} style={{fontSize:`${12/zoom}px`}}>{g.count}</text></g>})}
        </svg><div className="ce-map-caption"><span className="ce-red-dot"/> Customer presence · country-level locations <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Map: Natural Earth</a></div>{!world&&<p className="ce-map-fallback">Country list available while the map loads.</p>}</div>
        <aside className="ce-country-list"><div className="ce-country-title">{region||"Worldwide"}<span>{groups.length} {groups.length===1?"country":"countries"}</span></div>{groups.map(g=><button key={g.code} className={country===g.code?"selected":""} onClick={()=>setCountry(country===g.code?"":g.code)} aria-pressed={country===g.code}><span><span className="ce-country-code">{g.code}</span>{g.name}</span><b>{g.count}</b></button>)}{!groups.length&&<p>No countries match these filters.</p>}</aside>
      </div>
      {groups.some(g=>g.lon===undefined||g.lat===undefined)&&<p className="ce-map-fallback">Some countries are available in the country list but do not yet have a map marker.</p>}
    </section>
    <div className="ce-results-head"><div><h2>{country?countryName(country):sector||"Explore the network"}</h2><p aria-live="polite"><strong>{matches.length}</strong> {matches.length===1?"customer":"customers"} · {resultCountries.length} {resultCountries.length===1?"country":"countries"} · {activeCount} active{historical?` · ${historicalCount} historical`:""}{unknownCount?` · ${unknownCount} status unconfirmed`:""}</p></div>{(sector||region||country||search)&&<button onClick={reset}>Clear selection <X size={14}/></button>}</div>
    <div className="ce-cards">{matches.slice(0,limit).map(r=><article className="ce-card" key={r.id}>
      <div className="ce-card-top"><span className="ce-sector"><Layers size={12}/>{r.sector||UNKNOWN_SECTOR}</span>{r.active===false&&<span className="ce-history">Historical</span>}{r.active===null&&<span className="ce-history">Status unconfirmed</span>}</div>
      <h3>{r.name}</h3><div className="ce-location"><MapPin size={14}/>{countryName(r.country)}<span>·</span>{regionName(r.country)}</div>
      {r.evidence_status?<small className="ce-sector-evidence">{r.evidence_status==='suggested'?'Sector suggested · needs validation':r.evidence_status==='validated'?'Sector validated by HQ':null}</small>:r.sector_evidence&&<small className="ce-sector-evidence">{r.sector_evidence.startsWith("Suggested")||r.sector_evidence.startsWith("Correction proposed")?"Sector suggested · needs validation":r.sector_evidence.startsWith("Unresolved")?"Sector not identified":r.sector_evidence.startsWith("Web verified")?"Sector verified in supplied workbook":null}</small>}
      <div className="ce-contact"><span className="ce-avatar">{(r.contact_email?r.contact_name:"Customer Care").split(/\s+/).slice(0,2).map(s=>s[0]).join("")}</span><div><span>YOUR CONTACT</span><strong>{r.contact_email?r.contact_name:"Customer Care"}</strong><small>{r.contact_email?r.partner:"ManWinWin"}</small></div></div>
      <button className="ce-request" onClick={()=>openRequest(r)}>Ask for information<ArrowUpRight size={16}/></button>
    </article>)}</div>
    {!matches.length&&<div className="ce-empty"><Search size={30}/><h3>No customers match your selection</h3><p>Try another country or include historical customers. Customer Care can help you find relevant experience.</p><button onClick={reset}>Reset filters</button><a href={`mailto:${CUSTOMER_CARE_EMAIL}?subject=Help%20finding%20a%20customer%20reference`}>Contact Customer Care</a></div>}
    {matches.length>limit&&<div className="ce-more"><button onClick={()=>setLimit(v=>v+12)}>Show more customers <ChevronDown size={15}/></button><span>Showing {Math.min(limit,matches.length)} of {matches.length}</span></div>}
    <footer className="ce-footer"><span>One network. Shared experience.</span><span>Customer visibility does not imply availability for a reference call.</span></footer>
    {selected&&<div className="ce-modal-shade" onClick={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="ce-request-title" className="ce-modal"><button className="ce-modal-close" aria-label="Close request" onClick={()=>setSelected(null)} autoFocus><X size={20}/></button><span className="ce-modal-icon"><Mail size={24}/></span><h2 id="ce-request-title">Ask the person who knows.</h2><p>Information about <strong>{selected.name}</strong> · {countryName(selected.country)}</p><div className="ce-recipient"><span>TO</span><strong>{selected.contact_email?selected.contact_name:"Customer Care"}</strong><small>{selected.contact_email||CUSTOMER_CARE_EMAIL}</small></div><label className="ce-context">What are you working on?<textarea placeholder="For example: a hospital in Peru evaluating maintenance software. I'd like to understand if this customer is a relevant reference." value={context} onChange={e=>setContext(e.target.value)} rows={4}/></label><p className="ce-request-note">The responsible contact will advise what can be shared and whether a customer introduction is possible.</p><a className="ce-email-button" href={requestEmail(selected,context)}><Mail size={16}/>Open email draft<ArrowUpRight size={16}/></a><small className="ce-draft-note">Opens your email application. You review and send the message.</small></section></div>}
  </div>;
}
