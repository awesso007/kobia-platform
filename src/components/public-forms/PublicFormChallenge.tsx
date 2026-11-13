"use client";

/**
 * Round 52: explicit Turnstile widget for SPA public form clients.
 * Site key is public; the secret and Siteverify remain server-side.
 * Each failed submission resets a single-use challenge before retry.
 */
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type TurnstileClient = {
  render: (element: HTMLElement, options: {
    sitekey: string; action: string; callback: (token: string) => void;
    "expired-callback": () => void; "error-callback": () => void;
  }) => string | number;
  reset: (id: string | number) => void;
  remove: (id: string | number) => void;
};
declare global {
  interface Window { turnstile?: TurnstileClient }
}
export function PublicFormChallenge({
  siteKey, action, onToken, resetNonce,
}: {
  siteKey: string; action: string;
  onToken: (token: string | null) => void; resetNonce: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | number | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!siteKey || !scriptReady || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(container.current, {
      sitekey: siteKey, action,
      callback: token => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
    });
    widgetId.current = id;
    return () => {
      onTokenRef.current(null);
      api.remove(id);
      widgetId.current = null;
    };
  }, [siteKey, action, scriptReady]);

  useEffect(() => {
    if (!resetNonce || widgetId.current === null) return;
    window.turnstile?.reset(widgetId.current);
    onTokenRef.current(null);
  }, [resetNonce]);

  if (!siteKey) {
    return <p role="status" className="text-sm" style={{ color: "var(--kb-error)" }}>
      Submissions are temporarily unavailable. Please try again later.
    </p>;
  }
  return (
    <div aria-label="Security check">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => onTokenRef.current(null)}
      />
      <div ref={container} />
    </div>
  );
}
