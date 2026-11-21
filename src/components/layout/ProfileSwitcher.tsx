"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { UserCircle2 } from "lucide-react";
import { switchProfileAction } from "@/actions/profiles";

export function ProfileSwitcher({
  profiles,
  activeId,
}: {
  profiles: { id: number; name: string }[];
  activeId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (profiles.length === 0) {
    return (
      <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
        No profile yet
      </span>
    );
  }

  return (
    <label data-tour="profile-switcher" className="flex items-center gap-1.5">
      <UserCircle2 className="size-5 text-slate-500 dark:text-slate-400" aria-hidden />
      <span className="sr-only">Active profile</span>
      <select
        value={activeId ?? undefined}
        disabled={pending}
        onChange={(e) => {
          const id = Number(e.target.value);
          startTransition(async () => {
            const result = await switchProfileAction(id);
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else {
              toast.error(result.message);
            }
          });
        }}
        className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 focus:outline-2 focus:outline-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
