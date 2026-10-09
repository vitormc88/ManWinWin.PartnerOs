import {hasCaseStudy,type ExplorerClient} from '@/lib/customer-explorer';
export function CustomerCaseStudy({client}:{client:ExplorerClient}){
 if(!hasCaseStudy(client)||!client.case_study)return null;
 const study=client.case_study;
 return <section className="ce-case-study" aria-label={`Case study for ${client.name}`}>
  <div className="ce-case-header"><span>Case study available</span><small>{study.language} · public article</small></div>
  <a href={study.url} target="_blank" rel="noopener noreferrer" aria-label={`Read case study for ${client.name}`}>{study.title}<span aria-hidden="true"> ↗</span></a>
  <p className="ce-case-scope">{study.scope}</p>
  <details><summary>Project snapshot &amp; evidence</summary>
   <dl><dt>Challenge</dt><dd>{study.problem}</dd><dt>Approach</dt><dd>{study.approach}</dd><dt>Published evidence</dt><dd>{study.evidence}</dd><dt>Keep in mind</dt><dd>{study.limitation}</dd></dl>
   <small>Source reviewed {study.reviewed_at} · article claims, not independently audited results.</small>
  </details>
  <p className="ce-case-reference-note">Public reading does not imply availability for a reference call.</p>
 </section>;
}
