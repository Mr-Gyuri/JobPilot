"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { TagInput } from "@/components/ui/TagInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { deleteProfileAction, saveProfileAction, switchProfileAction } from "@/actions/profiles";
import type { Profile, WorkSetup } from "@/lib/types";
import { Users } from "lucide-react";

interface DraftProfile {
  id: number | null;
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  targetTitles: string[];
  preferredLocations: string[];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  workSetup: WorkSetup;
}

function emptyDraft(): DraftProfile {
  return {
    id: null,
    name: "",
    email: "",
    phone: "",
    location: "",
    headline: "",
    targetTitles: [],
    preferredLocations: ["Philippines"],
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "PHP",
    workSetup: "any",
  };
}

function toDraft(profile: Profile): DraftProfile {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    location: profile.location ?? "",
    headline: profile.headline ?? "",
    targetTitles: profile.targetTitles,
    preferredLocations: profile.preferredLocations,
    salaryMin: profile.salaryMin?.toString() ?? "",
    salaryMax: profile.salaryMax?.toString() ?? "",
    salaryCurrency: profile.salaryCurrency,
    workSetup: profile.workSetup,
  };
}

export function ProfilesClient({
  profiles,
  activeId,
  onboarding,
}: {
  profiles: Profile[];
  activeId: number | null;
  onboarding: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftProfile | null>(onboarding && profiles.length === 0 ? emptyDraft() : null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!draft) return;
    startTransition(async () => {
      const result = await saveProfileAction(draft.id, {
        name: draft.name,
        email: draft.email || null,
        phone: draft.phone || null,
        location: draft.location || null,
        headline: draft.headline || null,
        targetTitles: draft.targetTitles,
        preferredLocations: draft.preferredLocations,
        salaryMin: draft.salaryMin ? Number(draft.salaryMin) : null,
        salaryMax: draft.salaryMax ? Number(draft.salaryMax) : null,
        salaryCurrency: draft.salaryCurrency,
        workSetup: draft.workSetup,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        setDraft(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const remove = (profile: Profile) => {
    if (
      !window.confirm(
        `Delete "${profile.name}"? This permanently removes their resumes, jobs and tracker cards.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteProfileAction(profile.id);
      if (result.ok) {
        toast.success(result.message ?? "Deleted.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const makeActive = (id: number) => {
    startTransition(async () => {
      const result = await switchProfileAction(id);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      {profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No profiles yet"
          body="Create the first profile to start uploading resumes and tracking applications."
          action={
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="size-4" /> Create profile
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {profiles.map((profile) => (
              <Card key={profile.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold">{profile.name}</h2>
                        {profile.id === activeId && (
                          <Badge tone="indigo">
                            <CheckCircle2 className="size-3" /> Active
                          </Badge>
                        )}
                      </div>
                      {profile.headline && (
                        <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                          {profile.headline}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDraft(toDraft(profile))}
                        aria-label={`Edit ${profile.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(profile)}
                        aria-label={`Delete ${profile.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <dl className="space-y-1 text-sm">
                    {profile.email && (
                      <div className="flex gap-2">
                        <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                        <dd className="truncate">{profile.email}</dd>
                      </div>
                    )}
                    {(profile.salaryMin || profile.salaryMax) && (
                      <div className="flex gap-2">
                        <dt className="text-slate-500 dark:text-slate-400">Target pay</dt>
                        <dd>
                          {profile.salaryCurrency} {profile.salaryMin?.toLocaleString() ?? "—"}
                          {profile.salaryMax ? ` – ${profile.salaryMax.toLocaleString()}` : ""}
                        </dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="text-slate-500 dark:text-slate-400">Work setup</dt>
                      <dd className="capitalize">{profile.workSetup}</dd>
                    </div>
                  </dl>

                  {profile.targetTitles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {profile.targetTitles.map((title) => (
                        <Badge key={title} tone="sky">
                          {title}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {profile.id !== activeId && (
                    <Button size="sm" variant="secondary" onClick={() => makeActive(profile.id)}>
                      Switch to this profile
                    </Button>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          <Button variant="secondary" onClick={() => setDraft(emptyDraft())}>
            <Plus className="size-4" /> Add another profile
          </Button>
        </>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id == null ? "New profile" : `Edit ${draft?.name || "profile"}`}
        wide
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Juan Dela Cruz"
                  autoFocus
                />
              </Field>
              <Field label="Headline">
                <Input
                  value={draft.headline}
                  onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                  placeholder="Senior Backend Engineer"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="+63 917 000 0000"
                />
              </Field>
              <Field label="Current location">
                <Input
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="Makati, Metro Manila"
                />
              </Field>
              <Field label="Work setup preference">
                <Select
                  value={draft.workSetup}
                  onChange={(e) => setDraft({ ...draft, workSetup: e.target.value as WorkSetup })}
                >
                  <option value="any">No preference</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite</option>
                </Select>
              </Field>
            </div>

            <Field label="Target job titles" hint="Press Enter or comma to add each one.">
              <TagInput
                value={draft.targetTitles}
                onChange={(targetTitles) => setDraft({ ...draft, targetTitles })}
                placeholder="Backend Engineer, Tech Lead…"
              />
            </Field>

            <Field label="Preferred locations">
              <TagInput
                value={draft.preferredLocations}
                onChange={(preferredLocations) => setDraft({ ...draft, preferredLocations })}
                placeholder="Philippines, Remote…"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Currency">
                <Select
                  value={draft.salaryCurrency}
                  onChange={(e) => setDraft({ ...draft, salaryCurrency: e.target.value })}
                >
                  <option value="PHP">PHP</option>
                  <option value="USD">USD</option>
                  <option value="SGD">SGD</option>
                  <option value="AUD">AUD</option>
                  <option value="EUR">EUR</option>
                </Select>
              </Field>
              <Field label="Expected minimum">
                <Input
                  type="number"
                  min={0}
                  value={draft.salaryMin}
                  onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value })}
                  placeholder="80000"
                />
              </Field>
              <Field label="Expected maximum">
                <Input
                  type="number"
                  min={0}
                  value={draft.salaryMax}
                  onChange={(e) => setDraft({ ...draft, salaryMax: e.target.value })}
                  placeholder="120000"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={save} loading={pending} disabled={!draft.name.trim()}>
                {draft.id == null ? "Create profile" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
