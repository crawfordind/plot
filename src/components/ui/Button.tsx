"use client";

import type { ButtonHTMLAttributes } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-700",
  secondary:
    "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100",
  ghost: "text-stone-600 hover:bg-stone-100 active:bg-stone-100",
  subtle: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:bg-emerald-100",
  danger:
    "border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-[36px] gap-1.5 px-3 text-sm rounded-lg",
  md: "min-h-[44px] gap-2 px-4 text-sm rounded-xl",
  lg: "min-h-[52px] gap-2 px-5 text-base rounded-2xl",
};

const ICON_SIZE: Record<Size, number> = { sm: 16, md: 18, lg: 20 };

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  leftIcon,
  rightIcon,
  disabled,
  className = "",
  children,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      // Default to "button" so Cancel/Delete controls inside a <form> don't
      // implicitly submit it. Submit buttons must opt in with type="submit".
      type={type ?? "button"}
      disabled={disabled || loading}
      className={`focus-ring inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        leftIcon && <Icon name={leftIcon} size={ICON_SIZE[size]} />
      )}
      {children}
      {!loading && rightIcon && <Icon name={rightIcon} size={ICON_SIZE[size]} />}
    </button>
  );
}
