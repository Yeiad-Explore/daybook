import { LOGIN_ERRORS, type LoginError } from "@/lib/auth/login-errors";
import { GoogleButton } from "./google-button";

export const metadata = { title: "Sign in · Daybook" };

// Visual design comes with the DESIGN.md primitives (T15–T18); this is the working structure.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" && error in LOGIN_ERRORS ? LOGIN_ERRORS[error as LoginError] : null;

  return (
    <main>
      <h1>Daybook</h1>
      <p>Sign in to continue.</p>
      {message && <p role="alert">{message}</p>}
      <GoogleButton />
    </main>
  );
}
