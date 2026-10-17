"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { googleSignInOptions } from "@/lib/auth/sign-in-options";
import { createClient } from "@/lib/supabase/client";

/** A sign-in problem on the glass card: ink text with an ember dot (status never by colour alone). */
export function SignInAlert({ children }: { children: string }) {
  return (
    <p role="alert" className="type-body-sm flex items-center gap-2 text-ink">
      <span aria-hidden className="size-2 shrink-0 rounded-pill bg-signal" />
      {children}
    </p>
  );
}

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const { error } = await createClient().auth.signInWithOAuth(googleSignInOptions(window.location.origin));
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <Button variant="primary" icon={<ArrowRight size={12} strokeWidth={1.5} />} onClick={signIn} disabled={pending} className="self-start">
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {failed && <SignInAlert>Couldn&apos;t reach Google. Try again.</SignInAlert>}
    </>
  );
}
