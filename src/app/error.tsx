"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";

// Catches uncaught exceptions thrown while rendering any route under the root
// layout (the toast system handles *expected* errors from user actions; this is
// the safety net for the unexpected). Next 16 passes `unstable_retry` to
// re-render the segment without a full reload.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface it for debugging; a real deployment would forward this to an
    // error-reporting service.
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-1 items-center justify-center bg-emerald-50 px-safe pb-safe pt-safe">
      <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <Icon name="warning" size={26} />
        </span>
        <h1 className="mt-4 text-lg font-bold text-stone-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-stone-500">
          An unexpected error interrupted the page. Your data is safe — try again, and
          if it keeps happening, reload the app.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-stone-400">Ref: {error.digest}</p>
        )}
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
          <Button className="flex-1" onClick={() => unstable_retry()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
