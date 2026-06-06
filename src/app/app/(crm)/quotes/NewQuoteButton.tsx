"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { createQuote } from "./actions";

export function NewQuoteButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const id = await createQuote({});
      router.push(`/app/quotes/${id}`);
    });
  }

  return <KbButton onClick={create} disabled={pending}><Plus size={16} /> {pending ? "Creating..." : "New quote"}</KbButton>;
}
