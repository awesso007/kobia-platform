import * as React from "react";
import {describe,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import ServiceDocumentPanel from "@/app/app/(crm)/client-documents/ServiceDocumentPanel";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));
const base={businessId:"unit",clientProfileId:"fictional-client",service:"BOOKKEEPING" as const,
 canUpload:false,canManageLifecycle:false};
describe("Round 27 document consent and scan UI",()=>{
 it("describes live authorization and never offers downloads for unscanned objects",()=>{
  const html=renderToStaticMarkup(<ServiceDocumentPanel {...base}
   documents={[{id:"doc-1",fileName:"Fictional draft",mimeType:"application/pdf",
    status:"QUARANTINED",actualBytes:130,createdAt:"2026-11-11T00:00:00Z",
    verifiedAt:null,retentionUntil:null,legalHoldAt:null,suppressedAt:null}]}/>);
  expect(html).toContain("purpose-specific client consent");
  expect(html).toContain("expire after 60 seconds");
  expect(html).not.toContain("Download verified version");
  expect(html).not.toContain("Upload for malware review");
 });
 it("renders READY version download with explicit future revocation limitation",()=>{
  const html=renderToStaticMarkup(<ServiceDocumentPanel {...base}
   documents={[{id:"doc-2",fileName:"Fictional scanned report",mimeType:"application/pdf",
    status:"READY",actualBytes:130,createdAt:"2026-11-11T00:00:00Z",
    verifiedAt:"2026-11-11T00:05:00Z",retentionUntil:null,legalHoldAt:null,
    suppressedAt:null}]}/>);
  expect(html).toContain("Download verified version");
  expect(html).toContain("cannot");
  expect(html).toContain("retroactively invalidate");
 });
});
