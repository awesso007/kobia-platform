/** Fail-closed content binding: a clean scan is evidence for one exact S3
 * object VERSION, never just a mutable key. S3 versioning is mandatory. */
export type PinnedDocument = {
 storageVersionId:string|null;
 storageETag:string|null;
 actualBytes:number|null;
 mimeType:string;
 maxBytes:number;
};
export type StoredObjectMetadata = {
 versionId:string|null;
 etag:string|null;
 size:number;
 mimeType:string|null;
};
export function matchesPinnedDocument(doc:PinnedDocument,head:StoredObjectMetadata|null):boolean {
 return !!head && !!doc.storageVersionId && doc.storageVersionId!=="null" && !!doc.storageETag &&
  head.versionId===doc.storageVersionId && head.etag===doc.storageETag &&
  doc.actualBytes!==null && head.size===doc.actualBytes &&
  head.size>0 && head.size<=doc.maxBytes &&
  head.size<=20*1024*1024 && head.mimeType===doc.mimeType;
}
