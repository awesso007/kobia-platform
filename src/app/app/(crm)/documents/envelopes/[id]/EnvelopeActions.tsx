"use client";

/*
 * Envelope action buttons (Sprint 14): Send (DRAFT only) and Void (DRAFT/SENT).
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PrimaryButton, GhostButton } from "../../DocumentsUI";
import { sendEnvelopeAction, voidEnvelopeAction } from "../../actions";

export function EnvelopeActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onSend() {
    start(async () => {
      await sendEnvelopeAction(id);
      router.refresh();
    });
  }
  function onVoid() {
    if (!window.confirm("Void this envelope? Signers can no longer sign.")) return;
    start(async () => {
      await voidEnvelopeAction(id);
      router.refresh();
    });
  }

  const canSend = status === "DRAFT";
  const canVoid = status === "DRAFT" || status === "SENT";

  return (
    <div className="flex gap-2">
      {canSend ? (
        <PrimaryButton onClick={onSend} disabled={pending}>
          {pending ? "Sending..." : "Send"}
        </PrimaryButton>
      ) : null}
      {canVoid ? (
        <GhostButton onClick={onVoid} disabled={pending}>
          Void
        </GhostButton>
      ) : null}
    </div>
  );
}
