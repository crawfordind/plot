type Tone = "emerald" | "sky" | "amber" | "stone" | "red";

const TONES: Record<Tone, string> = {
  emerald: "bg-emerald-100 text-emerald-800",
  sky: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  stone: "bg-stone-100 text-stone-600",
  red: "bg-red-100 text-red-700",
};

const DOTS: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  stone: "bg-stone-400",
  red: "bg-red-500",
};

export function Badge({
  tone = "stone",
  dot,
  children,
  className = "",
}: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOTS[tone]}`} />;
}
