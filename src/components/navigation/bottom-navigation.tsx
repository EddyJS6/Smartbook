"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

const navigationItems: ReadonlyArray<{
  href: string;
  label: string;
  icon: IconName;
}> = [
  { href: "/", label: "Bibliothèque", icon: "library" },
  { href: "/ideas", label: "Idées", icon: "spark" },
  { href: "/settings", label: "Compte", icon: "settings" },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="bottom-nav fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[34rem]"
    >
      <div className="grid grid-cols-3 rounded-[1.35rem] border border-white/80 bg-[rgb(255_253_249_/_0.94)] p-1.5 shadow-[0_8px_30px_rgb(47_41_34_/_0.14)] backdrop-blur-xl">
        {navigationItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/books")
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.68rem] font-semibold transition-colors ${
                active
                  ? "bg-[var(--moss-soft)] text-[var(--moss)]"
                  : "text-[var(--muted)] active:bg-[var(--paper)]"
              }`}
            >
              <Icon name={item.icon} size={21} strokeWidth={active ? 2.2 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
