"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

// Last-resort boundary for errors thrown in the root layout itself (where the
// normal error.tsx can't render because the layout it depends on is the thing
// that failed). It must supply its own <html>/<body>. Kept dependency-free and
// inline-styled so it works even if the app's CSS/runtime is part of the failure.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Fatal app error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ecfdf5",
          fontFamily: "system-ui, sans-serif",
          color: "#1c1917",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 360,
            width: "100%",
            background: "#fff",
            border: "1px solid #fecaca",
            borderRadius: 24,
            padding: 24,
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
            Plot hit a snag
          </h1>
          <p style={{ fontSize: 14, color: "#78716c", margin: "0 0 20px" }}>
            The app couldn&apos;t recover from an unexpected error. Reloading usually
            fixes it.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
