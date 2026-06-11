"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useState,
} from "react";
import Button from "@/components/ui/Button";
import { isTourDone, markTourDone, TOUR_STEPS } from "@/lib/ui/tour";

export type TourHandle = { start: () => void };

type Rect = { top: number; left: number; width: number; height: number };

function targetRect(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const Tour = forwardRef<TourHandle>(function Tour(_props, ref) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useImperativeHandle(ref, () => ({
    start: () => {
      setStep(0);
      setOpen(true);
    },
  }));

  // Auto-start once for first-time users.
  useEffect(() => {
    if (!isTourDone()) {
      const t = window.setTimeout(() => setOpen(true), 600);
      return () => window.clearTimeout(t);
    }
  }, []);

  const current = TOUR_STEPS[step];

  const measure = useCallback(() => {
    setRect(open ? targetRect(current?.target) : null);
  }, [open, current?.target]);

  useLayoutEffect(() => {
    measure();
    if (!open) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step, measure]);

  if (!open || !current) return null;

  function finish() {
    markTourDone();
    setOpen(false);
    setStep(0);
  }

  const isLast = step === TOUR_STEPS.length - 1;
  const pad = 6;

  // Place the step card opposite the spotlight (below if target is in the top
  // half, otherwise above). Centered when there's no target.
  const cardBelow = rect ? rect.top < window.innerHeight / 2 : true;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Spotlight hole or full dim */}
      {rect ? (
        <div
          className="spotlight-pulse pointer-events-none absolute rounded-2xl"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-stone-950/60" />
      )}

      {/* Step card */}
      <div
        className="scale-in absolute inset-x-4 mx-auto max-w-sm rounded-2xl border border-emerald-100 bg-white p-4 shadow-2xl"
        style={
          rect
            ? cardBelow
              ? { top: rect.top + rect.height + pad + 12 }
              : { bottom: window.innerHeight - rect.top + pad + 12 }
            : { top: "50%", transform: "translateY(-50%)" }
        }
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-xs font-medium text-stone-400 hover:text-stone-600"
          >
            Skip
          </button>
        </div>
        <p className="mt-1.5 text-lg font-bold text-stone-900">{current.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{current.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-emerald-600" : "w-1.5 bg-stone-200"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            >
              {isLast ? "Get started" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default Tour;
