export interface SearchSuggestion {
  /** Goes straight into the Keywords box. Kept short - boards match literally. */
  keywords: string;
  /** One line explaining where this came from, so the list is auditable. */
  rationale: string;
}

export interface SuggestResult {
  suggestions: SearchSuggestion[];
  method: "ai" | "keyword";
  model: string | null;
}
