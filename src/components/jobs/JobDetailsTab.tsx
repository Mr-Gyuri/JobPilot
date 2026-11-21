"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { TagInput } from "@/components/ui/TagInput";
import { updateJobAction } from "@/actions/jobs";
import type { JobRecord, WorkMode } from "@/lib/types";

function BulletList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {items.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nothing extracted — add items so match analysis has more to work with.
        </p>
      )}
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Textarea
            className="min-h-14"
            value={item}
            onChange={(e) => onChange(items.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Remove item ${index + 1}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => onChange([...items, ""])}>
        <Plus className="size-3.5" /> Add
      </Button>
    </div>
  );
}

export function JobDetailsTab({ job }: { job: JobRecord }) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    title: job.title,
    company: job.company ?? "",
    location: job.location ?? "",
    workMode: job.workMode ?? "",
    employmentType: job.employmentType ?? "",
    salaryMin: job.salaryMin?.toString() ?? "",
    salaryMax: job.salaryMax?.toString() ?? "",
    salaryCurrency: job.salaryCurrency ?? "PHP",
    salaryPeriod: job.salaryPeriod ?? "",
    salaryText: job.salaryText ?? "",
    description: job.description ?? "",
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    skills: job.skills,
  });
  const [showRaw, setShowRaw] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateJobAction(job.id, {
        title: draft.title,
        company: draft.company || null,
        location: draft.location || null,
        workMode: (draft.workMode || null) as WorkMode | null,
        employmentType: draft.employmentType || null,
        salaryMin: draft.salaryMin ? Number(draft.salaryMin) : null,
        salaryMax: draft.salaryMax ? Number(draft.salaryMax) : null,
        salaryCurrency: draft.salaryCurrency || null,
        salaryPeriod: draft.salaryPeriod || null,
        salaryText: draft.salaryText || null,
        description: draft.description || null,
        responsibilities: draft.responsibilities.filter(Boolean),
        requirements: draft.requirements.filter(Boolean),
        skills: draft.skills.filter(Boolean),
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title *">
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <Input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </Field>
        <Field label="Work setup">
          <Select
            value={draft.workMode}
            onChange={(e) => setDraft({ ...draft, workMode: e.target.value })}
          >
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </Select>
        </Field>
        <Field label="Employment type">
          <Input
            value={draft.employmentType}
            onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })}
            placeholder="full-time"
          />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          <Field label="Cur." className="col-span-1">
            <Input
              value={draft.salaryCurrency}
              onChange={(e) => setDraft({ ...draft, salaryCurrency: e.target.value })}
            />
          </Field>
          <Field label="Salary min" className="col-span-1">
            <Input
              type="number"
              value={draft.salaryMin}
              onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value })}
            />
          </Field>
          <Field label="Salary max" className="col-span-1">
            <Input
              type="number"
              value={draft.salaryMax}
              onChange={(e) => setDraft({ ...draft, salaryMax: e.target.value })}
            />
          </Field>
          <Field label="Per" className="col-span-1">
            <Select
              value={draft.salaryPeriod}
              onChange={(e) => setDraft({ ...draft, salaryPeriod: e.target.value })}
            >
              <option value="">—</option>
              <option value="hour">hour</option>
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="year">year</option>
            </Select>
          </Field>
        </div>
        <Field label="Salary as posted">
          <Input
            value={draft.salaryText}
            onChange={(e) => setDraft({ ...draft, salaryText: e.target.value })}
            placeholder="e.g. PHP 90K–130K a month"
          />
        </Field>
      </div>

      <BulletList
        label="Responsibilities"
        items={draft.responsibilities}
        onChange={(responsibilities) => setDraft({ ...draft, responsibilities })}
      />
      <BulletList
        label="Requirements"
        items={draft.requirements}
        onChange={(requirements) => setDraft({ ...draft, requirements })}
      />

      <Field label="Skills mentioned">
        <TagInput
          value={draft.skills}
          onChange={(skills) => setDraft({ ...draft, skills })}
          placeholder="Add a skill and press Enter"
        />
      </Field>

      <div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showRaw ? "Hide" : "Show"} full description text
        </button>
        {showRaw && (
          <Textarea
            className="mt-2 min-h-64 font-mono text-xs"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        )}
      </div>

      <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button onClick={save} loading={pending} disabled={!draft.title.trim()}>
          <Save className="size-4" /> Save job details
        </Button>
      </div>
    </div>
  );
}
