"use client";

import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import HelpTip from "@/components/ui/HelpTip";

// Shared control base so every input/select/textarea matches.
export const controlClass =
  "focus-ring w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${className}`} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${controlClass} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} resize-none ${className}`} />;
}

type FieldProps = {
  label?: string;
  hint?: string;
  help?: string; // shows a "?" HelpTip next to the label
  error?: string | null;
  children: React.ReactNode;
  className?: string;
};

export function Field({ label, hint, help, error, children, className = "" }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <span className="flex items-center gap-1 text-xs font-medium text-stone-600">
          {label}
          {help && <HelpTip text={help} />}
        </span>
      )}
      <div className={label ? "mt-1" : ""}>{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
