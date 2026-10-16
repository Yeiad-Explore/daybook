// The sign-in page shows one of these fixed messages, never text taken from the URL.
export const LOGIN_ERRORS = {
  private: "This Daybook is private.", // AUTH-2 AC1
  failed: "Sign-in didn't work. Try again.",
} as const;

export type LoginError = keyof typeof LOGIN_ERRORS;

export function loginErrorFor(description: string | null | undefined): LoginError {
  return description?.includes(LOGIN_ERRORS.private) ? "private" : "failed";
}
