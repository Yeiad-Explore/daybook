import { GlassPanel } from "@/components/ui/glass-panel";
import { LOGIN_ERRORS, type LoginError } from "@/lib/auth/login-errors";
import { GoogleButton, SignInAlert } from "./google-button";

export const metadata = { title: "Sign in · Daybook" };

// One glass card on an aura (DESIGN.md: glass only over auras; text on glass is ink only).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" && error in LOGIN_ERRORS ? LOGIN_ERRORS[error as LoginError] : null;

  return (
    <main className="aura grid min-h-dvh place-items-center p-4">
      <GlassPanel className="flex w-full max-w-sm flex-col gap-6 p-8 max-tablet:p-6">
        <div className="flex flex-col gap-3">
          <p className="type-eyebrow text-ink">Daybook</p>
          <h1 className="type-display text-[32px] text-ink">Sign in to continue.</h1>
        </div>
        {message && <SignInAlert>{message}</SignInAlert>}
        <GoogleButton />
      </GlassPanel>
    </main>
  );
}
