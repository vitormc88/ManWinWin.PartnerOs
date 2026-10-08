import { describe,it,expect } from 'vitest';
import { clientKey,reviewDirectoryImport,validateDirectoryInput,type DirectoryInput,type DirectoryClient } from '../customer-directory';
const input:DirectoryInput={client_id:'0042',name:'Example',country:'Portugal',sector:'Manufacturing',active:null,visible:true,evidence_status:'unconfirmed',evidence_note:null};
const existing:DirectoryClient={...input,id:'uuid',source_id:'uuid',source_kind:'partner',partner:'Partner',contact_name:'Owner',contact_email:'owner@example.com',validated_at:null,validated_by:null};
describe('HQ directory management',()=>{
 it('uses numeric identity while preserving the displayed leading zeros',()=>{expect(clientKey('0042')).toBe('42');expect(validateDirectoryInput(input).client_id).toBe('0042');expect(validateDirectoryInput(input).country).toBe('PT');});
 it('rejects alphanumeric and reserved IDs, missing name/country and unsupported country',()=>{for(const bad of [{client_id:'0042A'},{client_id:'0000'},{client_id:'9998'},{name:''},{country:''},{country:'Atlantis'}])expect(()=>validateDirectoryInput({...input,...bad})).toThrow();});
 it('cannot validate a missing sector',()=>{expect(()=>validateDirectoryInput({...input,sector:null,evidence_status:'validated'})).toThrow();});
 it('accepts valid ISO countries even if low-resolution map coordinates are unavailable',()=>{expect(validateDirectoryInput({...input,country:'SG'}).country).toBe('SG');});
 it('never imports partner rows as HQ or changes their ownership',()=>{const r=reviewDirectoryImport([{'Client ID':'42','Client Name':'Example','Country':'PT','Sector':'Manufacturing'}],[existing]);expect(r[0].action).toBe('skip');expect(r[0].existing?.contact_email).toBe('owner@example.com');});
 it('blocks duplicate IDs within a file including zero-padded equivalents',()=>{const r=reviewDirectoryImport([{'Client ID':'0055','Client Name':'One','Country':'Portugal'},{'Client ID':'55','Client Name':'Two','Country':'PT'}],[]);expect(r.map(x=>x.action)).toEqual(['new','error']);});
 it('skips source tests and alphanumeric IDs without blocking legitimate customer rows',()=>{const r=reviewDirectoryImport([{'Client ID':'001A'},{'Client ID':'0000'},{'Client ID':'9998'}],[]);expect(r.every(x=>x.action==='skip')).toBe(true);});
 it('does not trust a file to validate sectors or invent lifecycle',()=>{const r=reviewDirectoryImport([{'Client ID':'55','Client Name':'One','Country':'Portugal','Sector':'Manufacturing','Sector Evidence Status':'Web verified'}],[]);expect(r[0].input.evidence_status).toBe('unconfirmed');expect(r[0].input.active).toBeNull();});
 it('preserves lifecycle and visibility on reviewed HQ updates',()=>{const r=reviewDirectoryImport([{'Client ID':'42','Client Name':'Updated','Country':'Portugal'}],[{...existing,source_kind:'hq',active:false,visible:false}]);expect(r[0].action).toBe('update');expect(r[0].input.active).toBe(false);expect(r[0].input.visible).toBe(false);});
});
