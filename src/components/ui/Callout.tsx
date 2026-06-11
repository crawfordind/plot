import Icon, { type IconName } from "@/components/ui/Icon";

type Tone = "info" | "warn" | "success" | "tip" | "danger";

const TONES: Record<Tone, { wrap: string; icon: string; defaultIcon: IconName }> = {
  info: { wrap: "border-sky-200 bg-sky-50 text-sky-900", icon: "text-sky-600", defaultIcon: "info" },
  warn: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "text-amber-600",
    defaultIcon: "warning",
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-600",
    defaultIcon: "check",
  },
  tip: {
    wrap: "border-emerald-100 bg-emerald-50/60 text-emerald-900",
    icon: "text-emerald-600",
    defaultIcon: "sparkle",
  },
  danger: { wrap: "border-red-200 bg-red-50 text-red-800", icon: "text-red-600", defaultIcon: "warning" },
};

type CalloutProps = {
  tone?: Tone;
  icon?: IconName | null;
  title?: string;
  children?: React.ReactNode;
  className?: string;
};

export default function Callout({
  tone = "info",
  icon,
  title,
  children,
  className = "",
}: CalloutProps) {
  const t = TONES[tone];
  const resolvedIcon = icon === null ? null : (icon ?? t.defaultIcon);
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${t.wrap} ${className}`}>
      <div className="flex gap-2.5">
        {resolvedIcon && (
          <span className={`mt-0.5 shrink-0 ${t.icon}`}>
            <Icon name={resolvedIcon} size={18} />
          </span>
        )}
        <div className="min-w-0 text-sm leading-snug">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        </div>
      </div>
    </div>
  );
}
