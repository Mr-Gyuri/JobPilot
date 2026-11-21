"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Link2,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ingest", label: "Ingest", icon: Link2 },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/tracker", label: "Tracker", icon: ClipboardList },
  { href: "/profiles", label: "Profiles", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Primary">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-tour={label.toLowerCase()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden md:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
