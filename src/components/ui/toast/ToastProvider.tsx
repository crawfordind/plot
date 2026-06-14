"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Icon, { type IconName } from "@/components/ui/Icon";

// A small, dependency-free toast system. One `<ToastProvider>` lives at the
// root (see app/layout.tsx); anything below it calls `useToast()` to push
// success / error / info / loading messages. Errors should generally be raised
// by passing the caught value straight to `toast.error(getErrorMessage(err))`.

export type ToastVariant = "success" | "error" | "info" | "loading";

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type ToastOptions = {
  /** Secondary line under the title — use it for the *reason* / next step. */
  description?: string;
  /** Auto-dismiss delay in ms. `null` keeps it until dismissed (loading does this). */
  duration?: number | null;
  /** A single inline action button, e.g. Undo / Retry / Sign in. */
  action?: ToastAction;
};

export type Toast = ToastOptions & {
  id: string;
  variant: ToastVariant;
  title: string;
  createdAt: number;
};

type ToastInput = string | ({ title: string } & ToastOptions);

export type ToastApi = {
  /** Generic push; returns an id you can pass to `update`/`dismiss`. */
  show: (variant: ToastVariant, input: ToastInput, opts?: ToastOptions) => string;
  success: (input: ToastInput, opts?: ToastOptions) => string;
  error: (input: ToastInput, opts?: ToastOptions) => string;
  info: (input: ToastInput, opts?: ToastOptions) => string;
  /** Persistent spinner toast (no auto-dismiss). Pair with `update`/`dismiss`. */
  loading: (input: ToastInput, opts?: ToastOptions) => string;
  update: (
    id: string,
    variant: ToastVariant,
    input: ToastInput,
    opts?: ToastOptions,
  ) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /**
   * Wrap a promise: shows a loading toast, then swaps to success or error.
   * The success/error message may be a function of the resolved/rejected value.
   */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: ToastInput;
      success: ToastInput | ((value: T) => ToastInput);
      error: ToastInput | ((error: unknown) => ToastInput);
    },
  ) => Promise<T>;
};

const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  success: 4000,
  info: 5000,
  error: 7000, // errors linger — the user needs time to read the reason
  loading: null,
};

const MAX_VISIBLE = 4;

const ToastContext = createContext<ToastApi | null>(null);

// Accepts either a string title or a full object, plus an optional second options
// arg (sonner-style: `toast.error("Saved", { description })`). The explicit opts
// merge over an object input.
function normalize(
  input: ToastInput,
  opts?: ToastOptions,
): { title: string } & ToastOptions {
  const base = typeof input === "string" ? { title: input } : input;
  return opts ? { ...base, ...opts } : base;
}

// Module-scoped counter so ids are unique without Math.random/Date.now (both of
// which are unavailable in some harness contexts and overkill here).
let toastSeq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const scheduleDismiss = useCallback(
    (id: string, duration: number | null | undefined, variant: ToastVariant) => {
      clearTimer(id);
      const ms = duration === undefined ? DEFAULT_DURATION[variant] : duration;
      if (ms == null) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    },
    [clearTimer, dismiss],
  );

  const show = useCallback(
    (variant: ToastVariant, input: ToastInput, opts?: ToastOptions) => {
      const { title, description, duration, action } = normalize(input, opts);
      const id = `toast-${++toastSeq}`;
      const toast: Toast = {
        id,
        variant,
        title,
        description,
        duration,
        action,
        createdAt: toastSeq,
      };
      setToasts((prev) => {
        const next = [...prev, toast];
        // Drop the oldest if we exceed the cap so the stack never grows unbounded.
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });
      scheduleDismiss(id, duration, variant);
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback(
    (id: string, variant: ToastVariant, input: ToastInput, opts?: ToastOptions) => {
      const { title, description, duration, action } = normalize(input, opts);
      let existed = false;
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          existed = true;
          return { ...t, variant, title, description, duration, action };
        }),
      );
      if (existed) scheduleDismiss(id, duration, variant);
    },
    [scheduleDismiss],
  );

  const api = useMemo<ToastApi>(() => {
    const dismissAll = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      setToasts([]);
    };
    return {
      show,
      success: (input, opts) => show("success", input, opts),
      error: (input, opts) => show("error", input, opts),
      info: (input, opts) => show("info", input, opts),
      loading: (input, opts) => show("loading", input, opts),
      update,
      dismiss,
      dismissAll,
      promise: async (promise, messages) => {
        const id = show("loading", messages.loading);
        try {
          const value = await promise;
          const msg =
            typeof messages.success === "function"
              ? messages.success(value)
              : messages.success;
          update(id, "success", msg);
          return value;
        } catch (error) {
          const msg =
            typeof messages.error === "function" ? messages.error(error) : messages.error;
          update(id, "error", msg);
          throw error;
        }
      },
    };
  }, [show, update, dismiss]);

  // Clean up any pending timers if the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const VARIANT_STYLE: Record<
  ToastVariant,
  { container: string; icon: IconName | null; iconWrap: string; actionBtn: string }
> = {
  success: {
    container: "border-emerald-200 bg-white text-stone-800",
    icon: "check",
    iconWrap: "bg-emerald-100 text-emerald-700",
    actionBtn: "text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100",
  },
  error: {
    container: "border-red-200 bg-white text-stone-800",
    icon: "warning",
    iconWrap: "bg-red-100 text-red-600",
    actionBtn: "text-red-600 hover:bg-red-50 active:bg-red-100",
  },
  info: {
    container: "border-stone-200 bg-white text-stone-800",
    icon: "info",
    iconWrap: "bg-stone-100 text-stone-600",
    actionBtn: "text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100",
  },
  loading: {
    container: "border-stone-200 bg-white text-stone-800",
    icon: null,
    iconWrap: "bg-stone-100 text-stone-500",
    actionBtn: "text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100",
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,var(--safe-bottom))]"
      role="region"
      aria-label="Notifications"
    >
      <div className="flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const style = VARIANT_STYLE[toast.variant];
  const [busy, setBusy] = useState(false);

  async function handleAction() {
    if (!toast.action || busy) return;
    setBusy(true);
    try {
      await toast.action.onClick();
    } finally {
      onDismiss(toast.id);
    }
  }

  return (
    <div
      className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${style.container}`}
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.iconWrap}`}
        aria-hidden="true"
      >
        {toast.variant === "loading" ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          style.icon && <Icon name={style.icon} size={15} strokeWidth={2.25} />
        )}
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold leading-snug">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm leading-snug text-stone-500">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={handleAction}
            disabled={busy}
            className={`focus-ring -ml-2 mt-1.5 rounded-lg px-2 py-1 text-sm font-semibold disabled:opacity-50 ${style.actionBtn}`}
          >
            {busy ? "…" : toast.action.label}
          </button>
        )}
      </div>

      {toast.variant !== "loading" && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="focus-ring -mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-stone-400 hover:text-stone-600"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
