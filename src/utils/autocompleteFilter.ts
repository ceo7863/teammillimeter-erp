export type AutocompleteOptionLike =
  | string
  | {
      label?: string;
      name?: string;
      value?: string;
      [key: string]: unknown;
    };

export type AutocompleteOption = {
  label: string;
  value: string;
  raw: unknown;
};

export function mapAutocompleteOptions(options: AutocompleteOptionLike[] = []): AutocompleteOption[] {
  return options.map((item) =>
    typeof item === "string"
      ? { label: item, value: item, raw: item }
      : {
          label: item.label ?? item.name ?? String(item.value ?? ""),
          value: String(item.value ?? item.name ?? item.label ?? ""),
          raw: item,
        }
  );
}

export function dedupeAutocompleteOptions(options: AutocompleteOption[]): AutocompleteOption[] {
  const seen = new Set<string>();
  const result: AutocompleteOption[] = [];

  for (const item of options) {
    const label = String(item.label || "").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, label, value: item.value || label });
  }

  return result;
}

function sortAutocompleteMatches(a: AutocompleteOption, b: AutocompleteOption, query: string) {
  const aLabel = String(a.label || "").trim();
  const bLabel = String(b.label || "").trim();

  if (!query) return aLabel.localeCompare(bLabel, "ko-KR");

  const q = query.toLowerCase();
  const aStarts = aLabel.toLowerCase().startsWith(q);
  const bStarts = bLabel.toLowerCase().startsWith(q);
  if (aStarts && !bStarts) return -1;
  if (!aStarts && bStarts) return 1;
  return aLabel.localeCompare(bLabel, "ko-KR");
}

/** Map, dedupe, and sort once — pass result to filterAutocompleteOptions. */
export function prepareAutocompleteOptions(options: AutocompleteOptionLike[] = []): AutocompleteOption[] {
  const deduped = dedupeAutocompleteOptions(mapAutocompleteOptions(options));
  return deduped.sort((a, b) => sortAutocompleteMatches(a, b, ""));
}

export function filterAutocompleteOptions(
  options: AutocompleteOption[],
  query: string,
  { limit = 12, allowEmpty = false }: { limit?: number; allowEmpty?: boolean } = {}
): AutocompleteOption[] {
  const q = String(query || "").trim().toLowerCase();

  if (!q) {
    if (!allowEmpty) return [];
    return options.slice(0, limit);
  }

  const seen = new Set<string>();
  const matched: AutocompleteOption[] = [];

  for (const item of options) {
    const label = String(item.label || "").trim();
    const key = label.toLowerCase();
    const raw = item.raw;
    const extra =
      raw && typeof raw === "object"
        ? ["ceoName", "manager", "phone", "businessNo"]
            .map((field) => String((raw as Record<string, unknown>)[field] ?? "").trim().toLowerCase())
            .filter(Boolean)
            .join(" ")
        : "";
    const haystack = extra ? `${key} ${extra}` : key;
    if (!label || !haystack.includes(q) || seen.has(key)) continue;
    seen.add(key);
    matched.push(item);
  }

  return matched.sort((a, b) => sortAutocompleteMatches(a, b, q)).slice(0, limit);
}

export function filterNamedSuggestions<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
  limit = 12
): T[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const matched: T[] = [];

  for (const item of items) {
    const label = getLabel(item).trim();
    const key = label.toLowerCase();
    if (!label || !key.includes(q) || seen.has(key)) continue;
    seen.add(key);
    matched.push(item);
  }

  return matched
    .sort((a, b) => {
      const aLabel = getLabel(a).trim();
      const bLabel = getLabel(b).trim();
      const aStarts = aLabel.toLowerCase().startsWith(q);
      const bStarts = bLabel.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aLabel.localeCompare(bLabel, "ko-KR");
    })
    .slice(0, limit);
}
