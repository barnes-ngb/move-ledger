import { useState } from "react";
import type { Container, Move, Zone } from "../../domain";
import { DEFAULT_CAPACITY, capacityOf, sizeLabel, spaceAndWeight } from "../../domain";
import { setMoveCapacity, writeInBackground } from "../../repositories";
import { Button, ErrorLine, Screen } from "../kit";
import { NumberField } from "../box/SizeChips";
import { numberText, parseNumber } from "../box/numberInput";

/** Thousands separated, at most one decimal. "4,610", "713.5". */
function amount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function boxes(n: number): string {
  return `${n} box${n === 1 ? "" : "es"}`;
}

/**
 * The boxes read against what the container holds. Totals only: ADR-0007
 * approves no loading order, no layout, and no suggestion of what to leave.
 *
 * The containers come from the same subscription as the box list, so offline
 * this reads the persistent cache like every other screen, and the header says
 * Offline as it does everywhere.
 */
export function SpaceAndWeight({
  moveId,
  move,
  containers,
  loaded,
  zones,
  onWeigh,
  onBack,
}: {
  moveId: string;
  move: Pick<Move, "capacityCuFt" | "capacityLb">;
  containers: readonly Container[];
  loaded: boolean;
  zones: readonly Zone[];
  onWeigh: () => void;
  onBack: () => void;
}) {
  const capacity = capacityOf(move);
  // Each field follows the move while it is untouched, the same shape box
  // detail uses: another phone can change the capacity while this is open,
  // and a field still showing the old figure would write it back on blur.
  const storedCuFt = numberText(capacity.cuFt);
  const storedLb = numberText(capacity.lb);
  const [cuFt, setCuFt] = useState(storedCuFt);
  const [lb, setLb] = useState(storedLb);
  const [lastCuFt, setLastCuFt] = useState(storedCuFt);
  const [lastLb, setLastLb] = useState(storedLb);
  if (storedCuFt !== lastCuFt) {
    setLastCuFt(storedCuFt);
    if (cuFt === lastCuFt) setCuFt(storedCuFt);
  }
  if (storedLb !== lastLb) {
    setLastLb(storedLb);
    if (lb === lastLb) setLb(storedLb);
  }
  const [error, setError] = useState<string | null>(null);

  if (!loaded) {
    return (
      <Screen title="Space and weight" onBack={onBack}>
        <p className="text-slate-400">Loading</p>
      </Screen>
    );
  }

  const t = spaceAndWeight(containers, zones, capacity);

  function saveCapacity() {
    const c = parseNumber(cuFt, 100000, 1);
    const w = parseNumber(lb, 1000000, 1);
    if (c.kind !== "value" || w.kind !== "value") {
      setError("Capacity is two numbers over 0, such as 710 cu ft and 4200 lb.");
      return;
    }
    setError(null);
    // Only the figure that changed is written, so blurring one field never
    // sends the other back from this phone's copy.
    const changed = {
      ...(c.value !== capacity.cuFt ? { capacityCuFt: c.value } : {}),
      ...(w.value !== capacity.lb ? { capacityLb: w.value } : {}),
    };
    if (Object.keys(changed).length === 0) return;
    try {
      writeInBackground(setMoveCapacity(moveId, changed).written, () =>
        setError("This change is saved on your phone. It has not reached the other phone yet.")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the capacity.");
    }
  }

  return (
    <Screen title="Space and weight" onBack={onBack}>
      {t.counted === 0 ? (
        <p className="text-slate-400">No boxes yet. Every box you add is counted here.</p>
      ) : (
        <>
          {t.notWeighed > 0 ? <Button onClick={onWeigh}>Weigh boxes</Button> : null}

          <div className="flex flex-col gap-2">
            <Bar label="Space" used={t.volumeCuFt} capacity={capacity.cuFt} unit="cu ft" />
            {t.noSize > 0 ? (
              <p className="text-sm text-slate-400">
                {boxes(t.noSize)} {t.noSize === 1 ? "has" : "have"} no size.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Bar label="Weight" used={t.weightLb} capacity={capacity.lb} unit="lb" />
            {t.notWeighed > 0 ? (
              <p className="text-sm text-slate-400">
                {boxes(t.notWeighed)} not weighed yet.
                {t.estimatedWeightLb !== undefined ? ` Estimate with them: ${amount(t.estimatedWeightLb)} lb.` : ""}
              </p>
            ) : null}
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold text-slate-100">By room</h3>
            <ul className="flex flex-col divide-y divide-slate-800">
              {t.byZone.map((r) => (
                <li key={r.zoneId ?? "none"} className="flex items-center gap-3 py-3">
                  {r.colorValue ? (
                    <span className="size-5 shrink-0 rounded-full" style={{ backgroundColor: r.colorValue }} />
                  ) : (
                    <span className="size-5 shrink-0 rounded-full border-2 border-dashed border-amber-400" />
                  )}
                  <span className="flex-1">
                    <span className="block text-slate-100">{r.name}</span>
                    <span className="block text-sm text-slate-400">
                      {boxes(r.count)}, {amount(r.volumeCuFt)} cu ft, {amount(r.weightLb)} lb
                      {r.notWeighed > 0 ? `. ${r.notWeighed} not weighed` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {t.bySize.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-slate-100">By size</h3>
              <ul className="flex flex-col divide-y divide-slate-800">
                {t.bySize.map((r) => (
                  <li key={r.size} className="py-3">
                    <span className="block text-slate-100">{sizeLabel(r.size)}</span>
                    <span className="block text-sm text-slate-400">
                      {boxes(r.count)}, {amount(r.volumeCuFt)} cu ft, {amount(r.weightLb)} lb
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-slate-100">Capacity</h3>
        <NumberField label="Usable space" unit="cu ft" value={cuFt} onChange={setCuFt} onCommit={saveCapacity} />
        <NumberField label="Weight limit" unit="lb" value={lb} onChange={setLb} onCommit={saveCapacity} />
        <p className="text-sm text-slate-400">
          16 ft PODS: {amount(DEFAULT_CAPACITY.cuFt)} cu ft usable, {amount(DEFAULT_CAPACITY.lb)} lb.
        </p>
        <ErrorLine message={error} />
      </section>
    </Screen>
  );
}

/** One total against its capacity. Over turns red and says by how much. */
function Bar({ label, used, capacity, unit }: { label: string; used: number; capacity: number; unit: string }) {
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const over = used > capacity;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={over ? "font-semibold text-rose-300" : "text-slate-100"}>
          {amount(used)} of {amount(capacity)} {unit}, {pct}%
        </span>
      </div>
      <div
        className="mt-2 h-4 overflow-hidden rounded-full bg-slate-800"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={capacity}
      >
        <div
          className={"h-full rounded-full " + (over ? "bg-rose-500" : "bg-sky-500")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {over ? (
        <p className="mt-1 font-semibold text-rose-300">
          {amount(Math.round((used - capacity) * 10) / 10)} {unit} over
        </p>
      ) : null}
    </div>
  );
}
