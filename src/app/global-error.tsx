"use client";

/**
 * Global error boundary — catches errors that escape every other boundary
 * (including root-layout and route-group layout errors). Without this,
 * Next.js shows a blank 500 page that hides the digest from the user.
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          color: "#111",
          background: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: 8, fontSize: 14, color: "#555" }}>
          We hit an unexpected error. The team has been notified.
        </p>
        {error.digest && (
          <p style={{ marginTop: 12, fontFamily: "monospace", fontSize: 12, color: "#999" }}>
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            background: "#0F172A",
            color: "white",
            padding: "8px 16px",
            border: 0,
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
