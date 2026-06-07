"use client";

/*
 * Analytics beacon (Sprint 17). A tiny client island that posts a PAGEVIEW to
 * the public /api/sites/track endpoint once per mount. Best-effort: failures are
 * swallowed so they never affect the rendered page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef } from "react";

export function TrackBeacon({ siteId, pageId, tenantSlug }: { siteId: string; pageId: string; tenantSlug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    try {
      const body = JSON.stringify({
        siteId,
        pageId,
        eventType: "PAGEVIEW",
        path: window.location.pathname,
        referrer: document.referrer || null,
      });
      const url = `/api/sites/track?t=${encodeURIComponent(tenantSlug)}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        void fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch {
      // ignore
    }
  }, [siteId, pageId, tenantSlug]);
  return null;
}
