import type { MoveContext } from "../hooks/useMove";
import { Screen } from "./kit";

/** Placeholder. APPLY-05 replaces this with Add box and Find. */
export function Home({ ctx, onSetup }: { ctx: MoveContext; onSetup: () => void }) {
  return (
    <Screen title={ctx.move?.name ?? "Move"}>
      <ul className="flex flex-col gap-2">
        {ctx.zones.map((z) => (
          <li key={z.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
            <span className="size-6 rounded-full" style={{ backgroundColor: z.colorValue }} />
            <span className="flex-1 text-slate-100">{z.name}</span>
            <span className="font-mono text-sm text-slate-400">{z.colorName}</span>
          </li>
        ))}
      </ul>
      <p className="text-slate-300">
        {ctx.members.length} member{ctx.members.length === 1 ? "" : "s"}
        {ctx.me ? `, your boxes are ${ctx.me.numberRangeStart} to ${ctx.me.numberRangeEnd}` : ""}.
      </p>
      <p className="text-sm text-slate-400">Adding and finding boxes arrives in the next build.</p>
      <button onClick={onSetup} className="min-h-12 self-start text-slate-400 underline">
        Rooms and members
      </button>
    </Screen>
  );
}
