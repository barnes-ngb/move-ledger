import { z } from "zod";
import {
  careNeedSchema,
  careStatusSchema,
  type CareNeed,
  type CareProvider,
  type CareStatus,
} from "./schemas";

export type { CareNeed, CareProvider, CareStatus };

/**
 * The care list: needs, each with its options. See decisions/0006-care-page.md.
 *
 * Everything here is pure. The repository writes what these return, and the
 * screen calls these rather than editing documents itself, so the two rules
 * that matter (one lean per need, display order stays dense) live in one
 * place and are tested once.
 */

/** What each status says on screen. Code never shows the enum value. */
export const CARE_STATUS_LABEL: Record<CareStatus, string> = {
  not_called: "Not called",
  called: "Called",
  booked: "Booked",
  passed: "Passed",
};

/** The order a tap on the status moves through. `passed` is reached only through the form, so a stray tap cannot rule someone out. */
const CYCLE: readonly CareStatus[] = ["not_called", "called", "booked"];

export function nextStatus(current: CareStatus): CareStatus {
  const at = CYCLE.indexOf(current);
  if (at < 0) return "not_called";
  return CYCLE[(at + 1) % CYCLE.length] ?? "not_called";
}

/** Needs in display order, then by title so two with the same order are stable. */
export function sortNeeds(needs: readonly CareNeed[]): CareNeed[] {
  return [...needs].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * The lean option first, then the rest in the order they were entered. The
 * reviewer reads the card top down, and the one the household is leaning
 * toward is the one to read first.
 */
export function sortProviders(providers: readonly CareProvider[]): CareProvider[] {
  const lean = providers.filter((p) => p.lean === true);
  const rest = providers.filter((p) => p.lean !== true);
  return [...lean, ...rest];
}

/** Marks one option as the lean and clears it from every other option on the need. Passing null clears it from all. */
export function setLean(need: CareNeed, providerId: string | null): CareNeed {
  return {
    ...need,
    providers: need.providers.map((p) => ({ ...p, lean: p.id === providerId ? true : undefined })),
  };
}

export function setProviderStatus(need: CareNeed, providerId: string, status: CareStatus): CareNeed {
  return {
    ...need,
    providers: need.providers.map((p) => (p.id === providerId ? { ...p, status } : p)),
  };
}

/** Replaces an option by id, or appends it when the id is new. */
export function putProvider(need: CareNeed, provider: CareProvider): CareNeed {
  const exists = need.providers.some((p) => p.id === provider.id);
  const providers = exists
    ? need.providers.map((p) => (p.id === provider.id ? provider : p))
    : [...need.providers, provider];
  // A new lean displaces the old one. Two leans on one card is the one state
  // the reviewer must never see.
  return provider.lean === true ? setLean({ ...need, providers }, provider.id) : { ...need, providers };
}

export function removeProvider(need: CareNeed, providerId: string): CareNeed {
  return { ...need, providers: need.providers.filter((p) => p.id !== providerId) };
}

/**
 * The paste-import shape. Looser than the stored document: no ids, no move,
 * no timestamps, status optional. Those are filled in here so a list typed
 * up elsewhere can be pasted once. Unknown keys are dropped rather than
 * refused, so a list with an extra column still imports.
 */
const importProviderSchema = z.object({
  name: z.string().min(1).max(120),
  practice: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  why: z.string().max(400).optional(),
  status: careStatusSchema.optional(),
  lean: z.boolean().optional(),
  note: z.string().max(200).optional(),
});

const importNeedSchema = z.object({
  title: z.string().min(1).max(80),
  note: z.string().max(300).optional(),
  providers: z.array(importProviderSchema).max(12).default([]),
});

export const careImportSchema = z.array(importNeedSchema).min(1).max(40);

export type CareImport = z.infer<typeof careImportSchema>;

export interface ImportContext {
  moveId: string;
  uid: string;
  now: string;
  newId: () => string;
  /** Where numbering starts, so an import appends after existing cards rather than interleaving. */
  firstOrder: number;
}

/**
 * Parses pasted text into stored documents, or returns one sentence saying
 * why it could not. The sentence is for the screen; the Zod detail goes to
 * the console by the caller.
 */
export function parseCareImport(
  text: string,
  ctx: ImportContext
): { ok: true; needs: CareNeed[] } | { ok: false; message: string; detail?: unknown } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: "That is not a list the app can read. It should start with [ and end with ].", detail: e };
  }
  const parsed = careImportSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    return { ok: false, message: `The list has a problem${where}: ${first?.message ?? "unknown"}.`, detail: parsed.error };
  }
  const needs = parsed.data.map((n, i) => {
    const providers: CareProvider[] = n.providers.map((p) => ({
      ...p,
      id: ctx.newId(),
      status: p.status ?? "not_called",
    }));
    const need: CareNeed = {
      id: ctx.newId(),
      moveId: ctx.moveId,
      title: n.title,
      note: n.note,
      order: ctx.firstOrder + i,
      providers,
      updatedAt: ctx.now,
      updatedBy: ctx.uid,
    };
    // Import can carry more than one lean per card; keep the first.
    const firstLean = providers.find((p) => p.lean === true);
    return careNeedSchema.parse(firstLean ? setLean(need, firstLean.id) : setLean(need, null));
  });
  return { ok: true, needs };
}

/**
 * The whole list as plain text, for Copy as text. This is the export for
 * this data: a person can paste it into a message or a note and nothing
 * about the format needs explaining.
 */
export function careToText(needs: readonly CareNeed[]): string {
  const lines: string[] = [];
  for (const need of sortNeeds(needs)) {
    lines.push(need.title.toUpperCase());
    if (need.note) lines.push(need.note);
    if (need.providers.length === 0) lines.push("  (no options yet)");
    for (const p of sortProviders(need.providers)) {
      const head = [p.lean ? "*" : "-", p.name, p.practice ? `(${p.practice})` : ""].filter(Boolean).join(" ");
      lines.push(`  ${head} [${CARE_STATUS_LABEL[p.status]}]`);
      if (p.why) lines.push(`    ${p.why}`);
      const contact = [p.phone, p.address].filter(Boolean).join(" · ");
      if (contact) lines.push(`    ${contact}`);
      if (p.note) lines.push(`    ${p.note}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
