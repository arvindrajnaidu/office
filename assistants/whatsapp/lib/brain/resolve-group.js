/**
 * Fuzzy group name → JID resolver with disambiguation.
 * Pure functions — no changes from the original.
 */
export function findMatchingGroups(groups, query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Exact match first
  const exact = groups.filter((g) => g.name?.toLowerCase() === q);
  if (exact.length > 0) return exact;

  // Contains match
  return groups.filter((g) => g.name?.toLowerCase().includes(q));
}

export function formatGroupChoices(matches) {
  return matches
    .map((g, i) => `  ${i + 1}. ${g.name}`)
    .join("\n");
}

export function resolveGroupByIndex(matches, index) {
  const i = parseInt(index, 10) - 1;
  if (i >= 0 && i < matches.length) return matches[i];
  return null;
}
