"use client";

import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { TagInput } from "@/components/ui/TagInput";
import type {
  Certification,
  EducationEntry,
  ExperienceEntry,
  ParsedResume,
} from "@/lib/parsing/schema";

function Section({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onAdd && (
          <Button size="sm" variant="secondary" onClick={onAdd}>
            <Plus className="size-3.5" /> {addLabel ?? "Add"}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Editable view of a ParsedResume. Parsing is never perfect, so every field the
 * parser fills is correctable here before the resume becomes a master.
 */
export function ResumeEditor({
  resume,
  onChange,
}: {
  resume: ParsedResume;
  onChange: (next: ParsedResume) => void;
}) {
  const patch = (partial: Partial<ParsedResume>) => onChange({ ...resume, ...partial });

  const updateExperience = (index: number, partial: Partial<ExperienceEntry>) => {
    const experience = resume.experience.map((e, i) => (i === index ? { ...e, ...partial } : e));
    patch({ experience });
  };

  const moveExperience = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= resume.experience.length) return;
    const experience = [...resume.experience];
    [experience[index], experience[target]] = [experience[target], experience[index]];
    patch({ experience });
  };

  return (
    <div className="space-y-4">
      <Section title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              value={resume.contact.fullName}
              onChange={(e) =>
                patch({ contact: { ...resume.contact, fullName: e.target.value } })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              value={resume.contact.email ?? ""}
              onChange={(e) =>
                patch({ contact: { ...resume.contact, email: e.target.value || null } })
              }
            />
          </Field>
          <Field label="Phone">
            <Input
              value={resume.contact.phone ?? ""}
              onChange={(e) =>
                patch({ contact: { ...resume.contact, phone: e.target.value || null } })
              }
            />
          </Field>
          <Field label="Location">
            <Input
              value={resume.contact.location ?? ""}
              onChange={(e) =>
                patch({ contact: { ...resume.contact, location: e.target.value || null } })
              }
            />
          </Field>
        </div>
        <Field label="Links" hint="One URL per tag — LinkedIn, GitHub, portfolio.">
          <TagInput
            value={resume.contact.links.map((l) => l.url)}
            onChange={(urls) =>
              patch({
                contact: {
                  ...resume.contact,
                  links: urls.map((url) => {
                    const existing = resume.contact.links.find((l) => l.url === url);
                    if (existing) return existing;
                    const lower = url.toLowerCase();
                    const label = lower.includes("linkedin")
                      ? "LinkedIn"
                      : lower.includes("github")
                        ? "GitHub"
                        : "Portfolio";
                    return { label, url };
                  }),
                },
              })
            }
            placeholder="https://linkedin.com/in/…"
          />
        </Field>
      </Section>

      <Section title="Professional summary">
        <Textarea
          value={resume.summary ?? ""}
          onChange={(e) => patch({ summary: e.target.value || null })}
          placeholder="Two or three sentences describing what you do and your strongest results."
          rows={4}
        />
      </Section>

      <Section
        title="Experience"
        addLabel="Add role"
        onAdd={() =>
          patch({
            experience: [
              ...resume.experience,
              { company: "", title: "", location: null, startDate: null, endDate: null, bullets: [""] },
            ],
          })
        }
      >
        {resume.experience.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No roles yet — add one so tailoring has something to work with.
          </p>
        )}
        <div className="space-y-4">
          {resume.experience.map((entry, index) => (
            <div
              key={index}
              className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Role {index + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveExperience(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveExperience(index, 1)}
                    disabled={index === resume.experience.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      patch({ experience: resume.experience.filter((_, i) => i !== index) })
                    }
                    aria-label="Remove role"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title">
                  <Input
                    value={entry.title}
                    onChange={(e) => updateExperience(index, { title: e.target.value })}
                  />
                </Field>
                <Field label="Company">
                  <Input
                    value={entry.company}
                    onChange={(e) => updateExperience(index, { company: e.target.value })}
                  />
                </Field>
                <Field label="Start date" hint="As written on your resume, e.g. Jun 2021">
                  <Input
                    value={entry.startDate ?? ""}
                    onChange={(e) =>
                      updateExperience(index, { startDate: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="End date" hint="Leave blank if this is your current role.">
                  <Input
                    value={entry.endDate ?? ""}
                    onChange={(e) => updateExperience(index, { endDate: e.target.value || null })}
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Bullets
                </span>
                {entry.bullets.map((bullet, bIndex) => (
                  <div key={bIndex} className="flex gap-2">
                    <Textarea
                      className="min-h-16"
                      value={bullet}
                      onChange={(e) => {
                        const bullets = entry.bullets.map((b, i) =>
                          i === bIndex ? e.target.value : b
                        );
                        updateExperience(index, { bullets });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateExperience(index, {
                          bullets: entry.bullets.filter((_, i) => i !== bIndex),
                        })
                      }
                      aria-label="Remove bullet"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => updateExperience(index, { bullets: [...entry.bullets, ""] })}
                >
                  <Plus className="size-3.5" /> Add bullet
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Education"
        addLabel="Add school"
        onAdd={() =>
          patch({
            education: [
              ...resume.education,
              { institution: "", degree: null, field: null, graduationDate: null, details: [] },
            ],
          })
        }
      >
        <div className="space-y-3">
          {resume.education.map((entry, index) => {
            const update = (partial: Partial<EducationEntry>) =>
              patch({
                education: resume.education.map((e, i) => (i === index ? { ...e, ...partial } : e)),
              });
            return (
              <div key={index} className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      patch({ education: resume.education.filter((_, i) => i !== index) })
                    }
                    aria-label="Remove education entry"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Institution">
                    <Input
                      value={entry.institution}
                      onChange={(e) => update({ institution: e.target.value })}
                    />
                  </Field>
                  <Field label="Degree">
                    <Input
                      value={entry.degree ?? ""}
                      onChange={(e) => update({ degree: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Field of study">
                    <Input
                      value={entry.field ?? ""}
                      onChange={(e) => update({ field: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Graduation">
                    <Input
                      value={entry.graduationDate ?? ""}
                      onChange={(e) => update({ graduationDate: e.target.value || null })}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Skills"
        addLabel="Add group"
        onAdd={() => patch({ skills: [...resume.skills, { name: null, skills: [] }] })}
      >
        <div className="space-y-3">
          {resume.skills.map((group, index) => (
            <div key={index} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="flex gap-2">
                <Input
                  value={group.name ?? ""}
                  placeholder="Group name (optional), e.g. Languages"
                  onChange={(e) =>
                    patch({
                      skills: resume.skills.map((g, i) =>
                        i === index ? { ...g, name: e.target.value || null } : g
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ skills: resume.skills.filter((_, i) => i !== index) })}
                  aria-label="Remove skill group"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <TagInput
                value={group.skills}
                onChange={(skills) =>
                  patch({
                    skills: resume.skills.map((g, i) => (i === index ? { ...g, skills } : g)),
                  })
                }
                placeholder="Type a skill and press Enter"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Certifications"
        addLabel="Add certification"
        onAdd={() =>
          patch({ certifications: [...resume.certifications, { name: "", issuer: null, date: null }] })
        }
      >
        <div className="space-y-3">
          {resume.certifications.map((cert, index) => {
            const update = (partial: Partial<Certification>) =>
              patch({
                certifications: resume.certifications.map((c, i) =>
                  i === index ? { ...c, ...partial } : c
                ),
              });
            return (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <Field label="Name" className="min-w-40 flex-1">
                  <Input value={cert.name} onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="Issuer" className="min-w-32 flex-1">
                  <Input
                    value={cert.issuer ?? ""}
                    onChange={(e) => update({ issuer: e.target.value || null })}
                  />
                </Field>
                <Field label="Date" className="w-28">
                  <Input
                    value={cert.date ?? ""}
                    onChange={(e) => update({ date: e.target.value || null })}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patch({ certifications: resume.certifications.filter((_, i) => i !== index) })
                  }
                  aria-label="Remove certification"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </Section>

      {resume.extraSections.length > 0 && (
        <Section title="Other sections">
          <div className="space-y-3">
            {resume.extraSections.map((section, index) => (
              <div key={index} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="flex gap-2">
                  <Input
                    value={section.heading}
                    onChange={(e) =>
                      patch({
                        extraSections: resume.extraSections.map((s, i) =>
                          i === index ? { ...s, heading: e.target.value } : s
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      patch({
                        extraSections: resume.extraSections.filter((_, i) => i !== index),
                      })
                    }
                    aria-label="Remove section"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={section.items.join("\n")}
                  onChange={(e) =>
                    patch({
                      extraSections: resume.extraSections.map((s, i) =>
                        i === index
                          ? { ...s, items: e.target.value.split("\n").filter(Boolean) }
                          : s
                      ),
                    })
                  }
                  rows={Math.min(8, Math.max(3, section.items.length))}
                />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
