"use client";

import type { ButtonHTMLAttributes } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import Tooltip from "@/components/ui/Tooltip";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  icon: IconName;
  label: string; // required for accessibility
  tooltip?: string; // hover tooltip text (defaults to label on desktop)
  size?: number;
  tone?: "default" | "primary" | "danger";
  variant?: "plain" | "surface";
};

const TONE: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  default: "text-stone-600",
  primary: "text-emerald-700",
  danger: "text-red-600",
};

export default function IconButton({
  icon,
  label,
  tooltip,
  size = 20,
  tone = "default",
  variant = "plain",
  className = "",
  ...props
}: IconButtonProps) {
  const btn = (
    <button
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      className={`focus-ring touch-target inline-flex items-center justify-center rounded-xl transition-colors ${
        variant === "surface"
          ? "border border-stone-200 bg-white/95 shadow-sm active:bg-stone-50"
          : "active:bg-stone-100"
      } ${TONE[tone]} ${className}`}
    >
      <Icon name={icon} size={size} />
    </button>
  );

  return tooltip ? <Tooltip text={tooltip}>{btn}</Tooltip> : btn;
}
