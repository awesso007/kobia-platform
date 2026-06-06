"use client";

/*
 * Global keyboard shortcut handler (Sprint 9). Mounted once in the CRM shell.
 *
 *   g then l/d/c/o/a/r  navigate to Leads/Deals/Contacts/Companies/Activities/Reports
 *   n                   dispatch kobia:new-record  (list pages open their create modal)
 *   /                   dispatch kobia:focus-search (list pages focus the inline filter)
 *   Esc                 dispatch kobia:escape       (open panes/modals close)
 *
 * Cmd+K is handled by the command palette itself. Shortcuts are ignored while
 * the user is typing in an input, textarea, select, or contenteditable, except
 * Esc which always fires.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GO_TO_ROUTES } from "@/lib/crm/shortcuts";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const leaderRef = useRef(false);
  const leaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearLeader() {
      leaderRef.current = false;
      if (leaderTimer.current) {
        clearTimeout(leaderTimer.current);
        leaderTimer.current = null;
      }
    }

    function onKey(e: KeyboardEvent) {
      // Esc always fires (even from inputs) so panes/modals can close.
      if (e.key === "Escape") {
        clearLeader();
        window.dispatchEvent(new Event("kobia:escape"));
        return;
      }

      // Cmd/Ctrl combos are owned elsewhere (palette). Ignore here.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // "g" begins a leader sequence; the next letter picks a destination.
      if (leaderRef.current) {
        const route = GO_TO_ROUTES[e.key.toLowerCase()];
        clearLeader();
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return;
      }

      if (e.key === "g") {
        leaderRef.current = true;
        leaderTimer.current = setTimeout(clearLeader, 1200);
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        window.dispatchEvent(new Event("kobia:new-record"));
      } else if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event("kobia:focus-search"));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearLeader();
    };
  }, [router]);

  return null;
}
