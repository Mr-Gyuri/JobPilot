"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { updateApplicationAction } from "@/actions/tracker";

export interface FollowUpItem {
  applicationId: number;
  jobId: number;
  date: string;
  title: string;
  company: string | null;
}

function tone(date: string): "red" | "amber" | "neutral" {
  const days = Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return "neutral";
  if (days < 0) return "red";
  if (days <= 3) return "amber";
  return "neutral";
}

export function FollowUpList({ items }: { items: FollowUpItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const clear = (applicationId: number) => {
    startTransition(async () => {
      const result = await updateApplicationAction(applicationId, { followUpDate: null });
      if (result.ok) {
        toast.success("Follow-up cleared.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.applicationId} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/jobs/${item.jobId}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {item.title}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {item.company && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{item.company}</span>
              )}
              <Badge tone={tone(item.date)}>{item.date}</Badge>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clear(item.applicationId)}
            disabled={pending}
            aria-label={`Clear follow-up for ${item.title}`}
          >
            <Check className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
