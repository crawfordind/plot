import Button from "@/components/ui/Button";
import Icon, { type IconName } from "@/components/ui/Icon";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconName;
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon name={icon} size={28} />
      </span>
      <p className="mt-3 text-base font-semibold text-stone-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-stone-500">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          variant="primary"
          size="md"
          leftIcon={actionIcon}
          onClick={onAction}
          className="mt-4"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
