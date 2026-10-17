/**
 * A contents list as a person reads it: one item per line, at the size the
 * paragraph it replaced was set in. Shared by the suggestion and the confirmed
 * list so the two cannot drift apart.
 */
export function ItemList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6 text-lg leading-relaxed text-slate-200">
      {items.map((item, i) => (
        // An item's text can repeat across an edit, so the index is part of the key.
        <li key={`${i}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

/** The categories that came with a list, small, under it. Searched, so shown. */
export function CategoryChips({ categories }: { categories: readonly string[] }) {
  if (categories.length === 0) return null;
  return (
    <div>
      <p className="text-sm text-slate-400">Kinds of things</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {categories.map((c) => (
          <li key={c} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
