#!/usr/bin/env node
/**
 * FIN01 Gate4D v2 static contract: guard against adding a Business proposal
 * field to the real CreateProposalDialog while silently omitting it from the
 * form-compatible SQL Draft save candidate.
 * ONLY reads committed source code. Does not connect to a database or network.
 */
import { readFileSync } from "node:fs";
const ui = readFileSync("src/components/proposals/CreateProposalDialog.tsx","utf8");
const source = readFileSync("src/lib/proposal-source.ts","utf8");
const sql = readFileSync("tests/sql/fin02/gate4d_ui_form_compatible_candidate.sql","utf8");
const jsBlock = (txt,begin,end) => {
  const i = txt.indexOf(begin);
  if (i<0) throw new Error("UI/source start anchor missing: "+begin);
  const j = txt.indexOf(end,i+begin.length);
  if (j<0) throw new Error("UI/source end anchor missing: "+end);
  return txt.slice(i+begin.length,j);
};
const fields = (chunk) => [
 ...[...chunk.matchAll(/^\s*([a-z][a-z0-9_]*):/gm)].map(m=>m[1]),
 ...[...chunk.matchAll(/^\s*([a-z][a-z0-9_]*),\s*$/gm)].map(m=>m[1]),
];
const insert = jsBlock(ui,"const insertData: any = {","\n      };");
const sourcePayload = jsBlock(source,"export function buildProposalSourcePayload","/** Storage folder");
const returnBlock=jsBlock(sourcePayload,"  return {","\n  };");
const expected=new Set([...fields(insert),...fields(returnBlock)]);
const allow=jsBlock(sql,"WHERE k NOT IN (",")) THEN");
const actual=new Set([...allow.matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]));
const missing=[...expected].filter(k=>!actual.has(k)).sort();
const unnecessary=[...actual].filter(k=>!expected.has(k)).sort();
if(missing.length||unnecessary.length){
 console.error("Gate4D Business form/SQL whitelist mismatch: missing",missing,"unnecessary",unnecessary);
 process.exit(1);
}
if(!["status","source_type","proposal_mode","business_config","created_by","lead_id","contract_id","license_id"].every(x=>actual.has(x))){
 throw new Error("Gate4D critical form/source field absent");
}
console.log("PASS: "+expected.size+" current CreateProposalDialog + source identity keys matched exactly to Gate4D-v2 SQL allowlist.");
