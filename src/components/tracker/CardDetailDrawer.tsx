"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { moveApplicationAction, removeApplicationAction, updateApplicationAction } from "@/actions/tracker";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/types";
import type { BoardCard } from "@/components/tracker/KanbanBoard";

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  // Accept both ISO datetimes and bare YYYY-MM-DD.
  return iso.length >= 10 ? iso.slice(0, 10) : "";
}

/**
 * Rendered with a `key` of the card id, so opening a different card remounts
 * this component and every field initialises from that card's own data.
 */
export function CardDetailDrawer({
  card,
  onClose,
}: {
  card: BoardCard;
  onClose: () => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(card.application.notes);
  const [followUp, setFollowUp] = useState(dateInputValue(card.application.followUpDate));
  const [appliedAt, setAppliedAt] = useState(dateInputValue(card.application.appliedAt));
  const [resumeDocId, setResumeDocId] = useState(
    card.application.sentResumeDocId?.toString() ?? ""
  );
  const [coverDocId, setCoverDocId] = useState(card.application.sentCoverDocId?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applicationId = card.application.id;
  const savedNotes = card.application.notes;

  // Autosave notes shortly after typing stops.
  useEffect(() => {
    if (notes === savedNotes) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateApplicationAction(applicationId, { notes });
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [notes, savedNotes, applicationId]);

  const resumeDocs = card.documents.filter((d) => d.docType === "resume");
  const coverDocs = card.documents.filter((d) => d.docType === "cover_letter");

  const saveFields = () => {
    startTransition(async () => {
      const result = await updateApplicationAction(card.application.id, {
        notes,
        followUpDate: followUp || null,
        appliedAt: appliedAt ? new Date(appliedAt).toISOString() : null,
        sentResumeDocId: resumeDocId ? Number(resumeDocId) : null,
        sentCoverDocId: coverDocId ? Number(coverDocId) : null,
      });
      if (result.ok) {
        toast.success("Card saved.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const changeStatus = (status: ApplicationStatus) => {
    startTransition(async () => {
      const result = await moveApplicationAction(card.application.id, status, [card.application.id]);
      if (result.ok) {
        toast.success(`Moved to ${STATUS_LABELS[status]}.`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const remove = () => {
    if (!window.confirm("Remove this card from the tracker? The job itself is kept.")) return;
    startTransition(async () => {
      const result = await removeApplicationAction(card.application.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed.");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Drawer open onClose={onClose} title={card.job.title}>
      <div className="space-y-4">
        <div className="space-y-1">
          {card.job.company && <p className="text-sm font-medium">{card.job.company}</p>}
          {card.job.location && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{card.job.location}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <ButtonLink href={`/jobs/${card.job.id}`} size="sm" variant="secondary">
              Open job workspace
            </ButtonLink>
            {card.job.sourceUrl && (
              <ButtonLink href={card.job.sourceUrl} external size="sm" variant="ghost">
                <ExternalLink className="size-3.5" /> Original posting
              </ButtonLink>
            )}
          </div>
        </div>

        <Field label="Stage">
          <Select
            value={card.application.status}
            onChange={(e) => changeStatus(e.target.value as ApplicationStatus)}
            disabled={pending}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date applied">
            <Input type="date" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
          </Field>
          <Field label="Follow up on">
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </Field>
        </div>

        <Field
          label="Resume version sent"
          hint={resumeDocs.length === 0 ? "Generate a tailored resume first." : undefined}
        >
          <Select
            value={resumeDocId}
            onChange={(e) => setResumeDocId(e.target.value)}
            disabled={resumeDocs.length === 0}
          >
            <option value="">Not recorded</option>
            {resumeDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                v{doc.version} · {doc.template}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Cover letter sent">
          <Select
            value={coverDocId}
            onChange={(e) => setCoverDocId(e.target.value)}
            disabled={coverDocs.length === 0}
          >
            <option value="">Not recorded</option>
            {coverDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                v{doc.version}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" hint="Autosaves as you type.">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Recruiter name, referral, interview feedback…"
          />
        </Field>

        <div className="flex justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="size-4" /> Remove
          </Button>
          <Button onClick={saveFields} loading={pending}>
            Save card
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
