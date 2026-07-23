import { Icon, type IconName } from "@/components/ui/icon";

type ComingSoonProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
};

export function ComingSoon({
  eyebrow,
  title,
  description,
  icon,
}: ComingSoonProps) {
  return (
    <div className="page-content flex items-center">
      <section className="w-full text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-[1.35rem] border border-[var(--line)] bg-[var(--card)] text-[var(--moss)] shadow-[0_8px_26px_rgb(48_39_30_/_0.06)]">
          <Icon name={icon} size={28} />
        </span>
        <p className="mt-6 text-[0.7rem] font-bold tracking-[0.16em] text-[var(--clay)] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.04em]">
          {title}
        </h1>
        <p className="balance mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
        <div className="mx-auto mt-7 w-fit rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--muted)]">
          Bientôt disponible
        </div>
      </section>
    </div>
  );
}
