import { describe, expect, it } from "vitest";
import {
  chessDocumentDownloadPath,
  documentDownloadAllowed,
  safeChessAttachmentDisposition,
} from "./documents";

describe("CHESS client document download proxy", () => {
  it("returns an application route, not a bearer storage URL", () => {
    const path = chessDocumentDownloadPath(
      "document / 01",
      "business&one",
      "client/one",
      "BOOKKEEPING",
    );
    expect(path.startsWith("/api/chess/documents/")).toBe(true);
    expect(path).toContain("/download?");
    expect(path).toContain("businessId=business%26one");
    expect(path).toContain("clientProfileId=client%2Fone");
    expect(path).not.toMatch(/^https?:\/\//);
    expect(path).not.toContain("amazonaws.com");
  });

  it("denies non-ready, suppressed, unpinned and expired documents", () => {
    const ready = {
      status: "READY",
      suppressedAt: null,
      retentionUntil: null,
      storageVersionId: "version-1",
      storageETag: "etag-1",
    };
    expect(documentDownloadAllowed(ready)).toBe(true);
    expect(documentDownloadAllowed({ ...ready, status: "QUARANTINED" })).toBe(false);
    expect(documentDownloadAllowed({ ...ready, suppressedAt: new Date() })).toBe(false);
    expect(documentDownloadAllowed({ ...ready, storageVersionId: null })).toBe(false);
    expect(documentDownloadAllowed({ ...ready, storageETag: null })).toBe(false);
    expect(documentDownloadAllowed({
      ...ready,
      retentionUntil: new Date(Date.now() - 1000),
    })).toBe(false);
  });

  it("creates a safe attachment disposition for untrusted filenames", () => {
    const value = safeChessAttachmentDisposition('report"\r\nX-Evil: yes.pdf');
    expect(value).toContain('filename="report__X-Evil: yes.pdf"');
    expect(value).toContain("filename*=UTF-8''");
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
  });
});
