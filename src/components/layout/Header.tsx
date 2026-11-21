import Link from "next/link";
import { Plane } from "lucide-react";
import { listProfiles } from "@/lib/repos/profiles";
import { getActiveProfileId } from "@/lib/active-profile";
import { NavLinks } from "@/components/layout/NavLinks";
import { ProfileSwitcher } from "@/components/layout/ProfileSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Tour } from "@/components/layout/Tour";

export async function Header() {
  const profiles = listProfiles();
  const activeId = await getActiveProfileId();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Plane className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">JobPilot</span>
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">
          <ProfileSwitcher
            profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
            activeId={activeId}
          />
          <Tour activeProfileId={activeId} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
