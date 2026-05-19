import {
  addAttachmentAction,
  deleteAttachmentAction,
} from "@/app/actions/attachment-actions";

type AttachmentRow = {
  id: string;
  filename: string;
  url: string;
  contentType: string | null;
  notes: string | null;
  createdAt: Date;
};

export function AttachmentList({
  tenantSlug,
  kind,
  parentId,
  attachments,
  canEdit = true,
}: {
  tenantSlug: string;
  kind: "bill" | "invoice" | "journalEntry";
  parentId: string;
  attachments: AttachmentRow[];
  canEdit?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </h3>
      </div>

      <div className="divide-y divide-slate-100">
        {attachments.length === 0 ? (
          <p className="px-4 py-3 text-xs text-slate-400">
            No attachments. Paste a link to a receipt, contract, or supporting document below.
          </p>
        ) : (
          attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium text-blue-700 hover:underline"
                  title={a.url}
                >
                  📎 {a.filename}
                </a>
                {a.notes && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">{a.notes}</p>
                )}
                <p className="text-[10px] text-slate-400">
                  Added {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
              {canEdit && (
                <form action={deleteAttachmentAction}>
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="attachmentId" value={a.id} />
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="parentId" value={parentId} />
                  <button
                    type="submit"
                    className="ml-3 text-xs text-slate-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </div>

      {canEdit && (
        <form
          action={addAttachmentAction}
          className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm"
        >
          <input type="hidden" name="tenantSlug" value={tenantSlug} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="parentId" value={parentId} />

          <label className="flex-1 min-w-[200px]">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              File URL
            </span>
            <input
              type="url"
              name="url"
              required
              placeholder="https://drive.google.com/... or https://dropbox.com/..."
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="w-40">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Label
            </span>
            <input
              type="text"
              name="filename"
              placeholder="receipt.pdf"
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <label className="flex-1 min-w-[160px]">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Notes
            </span>
            <input
              type="text"
              name="notes"
              maxLength={500}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Attach
          </button>
        </form>
      )}
    </div>
  );
}
