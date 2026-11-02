/** A window reserved in the click gesture avoids popup blocking after data loading. */
export async function openProposalPdf(html:string,target:Window) {
  target.document.open();target.document.write('<p style="font-family:Arial;padding:32px;color:#213c4b">Preparing your PDF…</p>');target.document.close();
  const {createBrandedProposalPdf}=await import("./proposal-branded-pdf");
  const bytes=await createBrandedProposalPdf(html);
  if(target.closed)throw new Error("The PDF preview window was closed. Generate the document again.");
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:"application/pdf"}));
  target.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),120000);
}
