import Link from "next/link";
import {
  Activity,
  Briefcase,
  CalendarClock,
  ClipboardList,
  FileText,
  Link2,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { requireProfileId } from "@/lib/require-profile";
import { getProfile } from "@/lib/repos/profiles";
import { dashboardStats } from "@/lib/repos/applications";
import { averageMatchScore } from "@/lib/repos/matches";
import { recentActivity } from "@/lib/repos/activity";
import { getJob } from "@/lib/repos/jobs";
import { listResumes } from "@/lib/repos/resumes";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { FollowUpList } from "@/components/dashboard/FollowUpList";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Briefcase;
}) {
  return (
    <Card>
      <CardBody className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
          <Icon className="size-4 text-slate-400" aria-hidden />
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </CardBody>
    </Card>
  );
}

const QUICK_ACTIONS = [
  { href: "/search", label: "Search jobs", icon: Search },
  { href: "/ingest", label: "Ingest a link", icon: Link2 },
  { href: "/resumes", label: "Manage resumes", icon: FileText },
  { href: "/tracker", label: "Open tracker", icon: ClipboardList },
] as const;

export default async function DashboardPage() {
  const profileId = await requireProfileId();
  const profile = getProfile(profileId);
  const stats = dashboardStats(profileId);
  const avgScore = averageMatchScore(profileId);
  const activity = recentActivity(profileId, 12);
  const resumes = listResumes(profileId);
  const hasMaster = resumes.some((r) => r.isMaster);

  const followUps = stats.upcomingFollowUps.map((item) => {
    const job = getJob(item.jobId);
    return {
      applicationId: item.applicationId,
      jobId: item.jobId,
      date: item.date,
      title: job?.title ?? "Job",
      company: job?.company ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {profile ? `${profile.name}'s dashboard` : "Dashboard"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Everything below is scoped to the active profile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </div>

      {!hasMaster && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 p-4 text-sm dark:border-indigo-500/40 dark:bg-indigo-500/10">
          <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
          <p className="flex-1 text-indigo-900 dark:text-indigo-200">
            Upload a resume and mark it as master — tailoring, match analysis and interview prep all
            work from it.
          </p>
          <Link
            href="/resumes"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Go to Resume Manager
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total applications"
          value={String(stats.totalApplications)}
          hint={`${stats.countsByStatus.saved} saved · ${stats.applied} applied`}
          icon={Briefcase}
        />
        <StatCard
          label="Response rate"
          value={stats.responseRate == null ? "—" : `${stats.responseRate}%`}
          hint="Interviews and offers ÷ applications sent"
          icon={TrendingUp}
        />
        <StatCard
          label="Interviews"
          value={String(stats.interviews)}
          hint={`${stats.offers} offer${stats.offers === 1 ? "" : "s"}`}
          icon={ClipboardList}
        />
        <StatCard
          label="Average match"
          value={avgScore == null ? "—" : `${avgScore}%`}
          hint="Across every analysis you've run"
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Applications per week"
            description="Counted from the date each application was marked as applied."
          />
          <CardBody>
            <WeeklyChart data={stats.weeklyCounts} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Follow-ups" description="Due within the next 7 days, or overdue." />
          <CardBody>
            {followUps.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing due"
                body="Set a follow-up date on a tracker card to see it here."
              />
            ) : (
              <FollowUpList items={followUps} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent activity" />
        <CardBody>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing yet — ingest a job or upload a resume to get started.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2 text-sm">
                  <Badge tone="neutral">{entry.kind.replace(/_/g, " ")}</Badge>
                  <span className="min-w-0 flex-1 truncate">{entry.message}</span>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
