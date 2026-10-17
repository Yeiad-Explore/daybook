// Phase 0/1 convention: rule errors from the database carry UI-ready messages (PRD §7, §10.6).
// 23514 = a rule, 42501 = use the RPC, 22023 = can't apply, P0002 = not found.
const RULE_CODES = new Set(["23514", "42501", "22023", "P0002"]);

export const SAVE_FAILED = "That didn't save. Check your connection and try again.";

/** The message to show for a failed write: the database's own words for rule errors, else a generic one. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && "message" in error && RULE_CODES.has(String(error.code))) {
    return String(error.message);
  }
  return SAVE_FAILED;
}

