"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/tasks", label: "Tasks" },
  { href: "/focus", label: "Focus" },
  { href: "/calendar", label: "Calendar" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/[0.82] px-5 backdrop-blur-xl">
      <p
        className="select-none font-serif text-lg font-medium"
        translate="no"
      >
        flowstate<span className="text-primary">.</span>
      </p>
      <nav className="flex gap-3" aria-label="Primary">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-3 py-1 text-sm no-underline transition-colors",
              pathname === link.href
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/settings"
          className={cn(
            "min-w-8 rounded-full px-2 py-1 text-center text-sm no-underline transition-colors",
            pathname === "/settings"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Settings"
        >
          ⚙
        </Link>
      </nav>
    </header>
  );
}
