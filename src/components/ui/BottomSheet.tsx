"use client";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fullScreen?: boolean;
  // Keep mounted (preserving form state) but visually hidden — used while the
  // map is in tap-to-place mode so the map underneath is reachable.
  hidden?: boolean;
};

export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  fullScreen = false,
  hidden = false,
}: BottomSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={hidden ? { display: "none" } : undefined}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
      />

      <div
        className={`relative flex w-full flex-col bg-white shadow-2xl sheet-enter ${
          fullScreen ? "h-[100dvh] rounded-none" : "max-h-[88dvh] rounded-t-3xl"
        }`}
      >
        <div className="flex shrink-0 justify-center pt-2">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        {(title || subtitle) && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 pb-3 pt-2">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-lg font-semibold text-stone-900">{title}</h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sheet"
              className="touch-target flex shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"
            >
              ✕
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-stone-100 px-4 py-3 pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
