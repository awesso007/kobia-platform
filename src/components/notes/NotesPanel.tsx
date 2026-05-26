import { db } from "@/lib/db";
import { createNote, togglePinNote, deleteNote } from "@/app/actions/note-actions";

type Subject = "ENTITY" | "CUSTOMER" | "VENDOR" | "LEAD" | "ENGAGEMENT";

interface NotesPanelProps {
  tenantId: string;
  tenantSlug: string;
  subjectType: Subject;
  subjectId: string;
  revalidate: string;
  title?: string;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function NotesPanel({
  tenantId,
  tenantSlug,
  subjectType,
  subjectId,
  revalidate,
  title = "Notes",
}: NotesPanelProps) {
  // Pull top-level notes + replies
  const topLevel = await db.clientNote.findMany({
    where: { tenantId, subjectType, subjectId, parentId: null },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      replies: { orderBy: { createdAt: "asc" } },
    },
    take: 50,
  });

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">{topLevel.length} note{topLevel.length === 1 ? "" : "s"}</span>
      </header>

      <form action={createNote} className="border-b border-slate-200 p-4">
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="subjectType" value={subjectType} />
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="revalidate" value={revalidate} />
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Add a note. Markdown not supported — keep it short."
          className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="isPinned" className="rounded border-slate-300" />
            Pin to top
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Add note
          </button>
        </div>
      </form>

      <div className="divide-y divide-slate-100">
        {topLevel.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No notes yet. Add the first one above.
          </p>
        ) : (
          topLevel.map((n) => (
            <article key={n.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-900">{n.authorName}</span>
                    <span className="text-xs text-slate-400">{fmtDate(n.createdAt)}</span>
                    {n.isPinned ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Pinned
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={togglePinNote}>
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="noteId" value={n.id} />
                    <input type="hidden" name="revalidate" value={revalidate} />
                    <button
                      type="submit"
                      className="text-xs text-slate-500 hover:text-slate-900"
                      title={n.isPinned ? "Unpin" : "Pin"}
                    >
                      {n.isPinned ? "Unpin" : "Pin"}
                    </button>
                  </form>
                  <form action={deleteNote}>
                    <input type="hidden" name="tenantSlug" value={tenantSlug} />
                    <input type="hidden" name="noteId" value={n.id} />
                    <input type="hidden" name="revalidate" value={revalidate} />
                    <button
                      type="submit"
                      className="text-xs text-slate-500 hover:text-rose-600"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>

              {/* Replies */}
              {n.replies.length > 0 ? (
                <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                  {n.replies.map((r) => (
                    <div key={r.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-900">{r.authorName}</span>
                        <span className="text-xs text-slate-400">{fmtDate(r.createdAt)}</span>
                        <form action={deleteNote} className="ml-auto">
                          <input type="hidden" name="tenantSlug" value={tenantSlug} />
                          <input type="hidden" name="noteId" value={r.id} />
                          <input type="hidden" name="revalidate" value={revalidate} />
                          <button
                            type="submit"
                            className="text-xs text-slate-400 hover:text-rose-600"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Reply form */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">
                  Reply
                </summary>
                <form action={createNote} className="mt-2 space-y-2">
                  <input type="hidden" name="tenantSlug" value={tenantSlug} />
                  <input type="hidden" name="subjectType" value={subjectType} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <input type="hidden" name="parentId" value={n.id} />
                  <input type="hidden" name="revalidate" value={revalidate} />
                  <textarea
                    name="body"
                    rows={2}
                    required
                    placeholder="Reply…"
                    className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    Post reply
                  </button>
                </form>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
