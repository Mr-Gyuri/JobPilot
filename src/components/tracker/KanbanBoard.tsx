"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, ExternalLink, FileText, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardDetailDrawer } from "@/components/tracker/CardDetailDrawer";
import { moveApplicationAction } from "@/actions/tracker";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationRecord,
  type ApplicationStatus,
  type DocType,
  type TemplateId,
} from "@/lib/types";

export interface BoardCard {
  application: ApplicationRecord;
  job: {
    id: number;
    title: string;
    company: string | null;
    location: string | null;
    sourceUrl: string | null;
    source: string;
  };
  documents: { id: number; docType: DocType; template: TemplateId; version: number }[];
}

const COLUMN_TONES: Record<ApplicationStatus, string> = {
  saved: "border-slate-300 dark:border-slate-700",
  applied: "border-sky-300 dark:border-sky-500/40",
  interview: "border-indigo-300 dark:border-indigo-500/40",
  offer: "border-emerald-300 dark:border-emerald-500/40",
  rejected: "border-rose-300 dark:border-rose-500/40",
};

function followUpTone(date: string | null): "red" | "amber" | "neutral" | null {
  if (!date) return null;
  const due = Date.parse(date);
  if (Number.isNaN(due)) return null;
  const days = Math.ceil((due - Date.now()) / 86_400_000);
  if (days < 0) return "red";
  if (days <= 3) return "amber";
  return "neutral";
}

function CardBody({ card }: { card: BoardCard }) {
  const tone = followUpTone(card.application.followUpDate);
  const sentResume = card.documents.find((d) => d.id === card.application.sentResumeDocId);

  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-snug font-medium">{card.job.title}</p>
      {card.job.company && (
        <p className="text-xs text-slate-600 dark:text-slate-400">{card.job.company}</p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone="neutral">{card.job.source}</Badge>
        {card.application.appliedAt && (
          <Badge tone="sky">
            applied {new Date(card.application.appliedAt).toLocaleDateString()}
          </Badge>
        )}
        {sentResume && (
          <Badge tone="indigo">
            <FileText className="size-3" /> v{sentResume.version}
          </Badge>
        )}
        {tone && (
          <Badge tone={tone}>
            <CalendarClock className="size-3" /> {card.application.followUpDate}
          </Badge>
        )}
        {card.application.notes.trim() && (
          <Badge tone="neutral">
            <StickyNote className="size-3" />
          </Badge>
        )}
      </div>
    </div>
  );
}

function SortableCard({ card, onOpen }: { card: BoardCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.application.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${card.job.title}`}
          className="mt-0.5 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600"
        >
          ⋮⋮
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <CardBody card={card} />
        </button>
        {card.job.sourceUrl && (
          <a
            href={card.job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open original posting"
            className="mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function Column({
  status,
  cards,
  onOpen,
}: {
  status: ApplicationStatus;
  cards: BoardCard[];
  onOpen: (card: BoardCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 snap-start flex-col rounded-xl border-t-4 bg-slate-100/70 p-2.5 dark:bg-slate-900/50 ${
        COLUMN_TONES[status]
      } ${isOver ? "ring-2 ring-indigo-400" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">{cards.length}</span>
      </div>
      <SortableContext
        items={cards.map((c) => c.application.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-24 flex-1 flex-col gap-2">
          {cards.map((card) => (
            <SortableCard
              key={card.application.id}
              card={card}
              onOpen={() => onOpen(card)}
            />
          ))}
          {cards.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-slate-400 dark:text-slate-600">
              Drop cards here
            </p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

interface MoveUpdate {
  movedId: number;
  toStatus: ApplicationStatus;
  orderedIds: number[];
}

/** Apply a drag result locally so the drop lands instantly. */
function applyMove(current: BoardCard[], { movedId, toStatus, orderedIds }: MoveUpdate): BoardCard[] {
  return current.map((card) => {
    if (card.application.id === movedId) {
      return {
        ...card,
        application: {
          ...card.application,
          status: toStatus,
          sortOrder: (orderedIds.indexOf(movedId) + 1) * 1000,
          appliedAt:
            toStatus === "applied" && !card.application.appliedAt
              ? new Date().toISOString()
              : card.application.appliedAt,
        },
      };
    }
    const index = orderedIds.indexOf(card.application.id);
    return index >= 0
      ? { ...card, application: { ...card.application, sortOrder: (index + 1) * 1000 } }
      : card;
  });
}

export function KanbanBoard({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  // useOptimistic shows the move immediately and reverts to server state when
  // the action settles — no manual rollback, no prop-to-state syncing.
  const [board, applyOptimisticMove] = useOptimistic(cards, applyMove);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const byStatus = (status: ApplicationStatus) =>
    board
      .filter((c) => c.application.status === status)
      .sort((a, b) => a.application.sortOrder - b.application.sortOrder);

  const activeCard = board.find((c) => c.application.id === activeId) ?? null;
  const openCardDetail = board.find((c) => c.application.id === openCardId) ?? null;

  const onDragStart = (event: DragStartEvent) => setActiveId(Number(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const movedId = Number(active.id);
    const moved = board.find((c) => c.application.id === movedId);
    if (!moved) return;

    // Dropping on a column header vs. on another card.
    const overId = String(over.id);
    let toStatus: ApplicationStatus;
    let overCardId: number | null = null;
    if (overId.startsWith("column:")) {
      toStatus = overId.slice("column:".length) as ApplicationStatus;
    } else {
      overCardId = Number(overId);
      const overCard = board.find((c) => c.application.id === overCardId);
      if (!overCard) return;
      toStatus = overCard.application.status;
    }

    const destination = byStatus(toStatus).filter((c) => c.application.id !== movedId);
    const insertAt =
      overCardId == null
        ? destination.length
        : Math.max(0, destination.findIndex((c) => c.application.id === overCardId));
    const orderedIds = [
      ...destination.slice(0, insertAt).map((c) => c.application.id),
      movedId,
      ...destination.slice(insertAt).map((c) => c.application.id),
    ];

    if (
      moved.application.status === toStatus &&
      orderedIds.join(",") === byStatus(toStatus).map((c) => c.application.id).join(",")
    ) {
      return; // nothing actually changed
    }

    startTransition(async () => {
      applyOptimisticMove({ movedId, toStatus, orderedIds });
      const result = await moveApplicationAction(movedId, toStatus, orderedIds);
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  };

  if (board.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No applications tracked yet"
        body="Ingest a job, then add it to the tracker to follow it from Saved through to Offer."
        action={
          <Link
            href="/ingest"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ingest a job
          </Link>
        }
      />
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex snap-x gap-3 overflow-x-auto pb-4">
          {APPLICATION_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              cards={byStatus(status)}
              onOpen={(card) => setOpenCardId(card.application.id)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="w-72 rotate-1 rounded-lg border border-indigo-400 bg-white p-2.5 shadow-lg dark:bg-slate-900">
              <CardBody card={activeCard} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Keyed so each card gets a fresh form initialised from its own data. */}
      {openCardDetail && (
        <CardDetailDrawer
          key={openCardDetail.application.id}
          card={openCardDetail}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </>
  );
}
