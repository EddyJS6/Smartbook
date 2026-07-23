import Link from "next/link";
import { Icon } from "@/components/ui/icon";

type BackLinkProps = {
  href: string;
  label?: string;
};

export function BackLink({ href, label = "Retour" }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm font-semibold text-[var(--moss)]"
    >
      <Icon name="arrow-left" size={19} />
      {label}
    </Link>
  );
}
