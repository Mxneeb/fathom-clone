export type HighlightLabel = "HIGHLIGHT" | "POSITIVE_REACTION" | "NEEDS_REVIEW" | "FEEDBACK";

export const HIGHLIGHT_LABELS: Record<HighlightLabel, { name: string; color: string }> = {
  HIGHLIGHT: { name: "Highlight", color: "#b8471c" },
  POSITIVE_REACTION: { name: "Positive", color: "#2f6b48" },
  NEEDS_REVIEW: { name: "Needs review", color: "#86630f" },
  FEEDBACK: { name: "Feedback", color: "#5b4a8a" },
};

export const LABEL_ORDER: HighlightLabel[] = ["HIGHLIGHT", "POSITIVE_REACTION", "NEEDS_REVIEW", "FEEDBACK"];
