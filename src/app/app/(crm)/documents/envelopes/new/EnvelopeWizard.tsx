"use client";

/*
 * Envelope wizard (Sprint 14): pick a document, name the request, add signers
 * (name/email/order), and either save as DRAFT or send immediately. Field
 * placement is represented as a simple per-signer note for now; the public
 * signing page collects the actual signature.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, PrimaryButton, GhostButton } from "../../DocumentsUI";
import { createEnvelopeAction } from "../../actions";

type DocOption = { id: string; name: string; kind: string };
type SignerForm = { name: string; email: string };

export function EnvelopeWizard({ documents, initialDocumentId }: { documents: DocOption[]; initialDocumentId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [documentId, setDocumentId] = useState(initialDocumentId ?? documents[0]?.id ?? "");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState<SignerForm[]>([{ name: "", email: "" }]);
  const [error, setError] = useState<string>("");

  function updateSigner(i: number, patch: Partial<SignerForm>) {
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSigner() {
    setSigners((prev) => [...prev, { name: "", email: "" }]);
  }
  function removeSigner(i: number) {
    setSigners((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit(send: boolean) {
    setError("");
    const cleanSigners = signers
      .map((s, i) => ({ name: s.name.trim(), email: s.email.trim(), order: i }))
      .filter((s) => s.name && s.email);
    if (!documentId) return setError("Select a document.");
    if (!name.trim()) return setError("Enter an envelope name.");
    if (cleanSigners.length === 0) return setError("Add at least one signer.");
    start(async () => {
      try {
        const { id } = await createEnvelopeAction({
          name: name.trim(),
          documentId,
          message: message.trim() || null,
          signers: cleanSigners,
          send,
        });
        router.push(`/app/documents/envelopes/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create envelope.");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-4">
        <Field label="Document">
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm"
            style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
          >
            {documents.length === 0 ? <option value="">No documents available</option> : null}
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.kind})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Envelope name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NDA - Acme Corp"
            className="w-full rounded px-3 py-2 text-sm"
            style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
          />
        </Field>
        <Field label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full rounded px-3 py-2 text-sm"
            style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
          />
        </Field>
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
          Signers (sign in order)
        </div>
        <div className="space-y-2">
          {signers.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={s.name}
                onChange={(e) => updateSigner(i, { name: e.target.value })}
                placeholder="Name"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
              />
              <input
                value={s.email}
                onChange={(e) => updateSigner(i, { email: e.target.value })}
                placeholder="Email"
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
              />
              {signers.length > 1 ? (
                <button onClick={() => removeSigner(i)} className="px-2 text-sm" style={{ color: "#d9534f" }}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button onClick={addSigner} className="mt-2 text-sm hover:underline" style={{ color: "var(--kb-primary)" }}>
          + Add signer
        </button>
      </Card>

      {error ? (
        <p className="text-sm" style={{ color: "#d9534f" }}>
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <PrimaryButton onClick={() => submit(true)} disabled={pending}>
          {pending ? "Working..." : "Create and send"}
        </PrimaryButton>
        <GhostButton onClick={() => submit(false)} disabled={pending}>
          Save as draft
        </GhostButton>
        <Link href="/app/documents/envelopes">
          <GhostButton>Cancel</GhostButton>
        </Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
