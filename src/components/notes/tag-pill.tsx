import { Icon } from "@/components/ui/icon";

type TagPillProps = {
  tag: string;
  onRemove?: () => void;
};

export function TagPill({ tag, onRemove }: TagPillProps) {
  if (!onRemove) {
    return (
      <span className="max-w-full truncate rounded-full bg-[var(--moss-soft)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--moss)]">
        {tag}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-[var(--moss-soft)] text-[var(--moss)]">
      <span className="max-w-40 truncate py-1.5 pl-3 text-xs font-semibold">
        {tag}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Supprimer le tag ${tag}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}
