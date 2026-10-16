"use client";

import { useState } from "react";
import { googleSignInOptions } from "@/lib/auth/sign-in-options";
import { createClient } from "@/lib/supabase/client";

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
      <button type="button" onClick={signIn} disabled={pending}>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {failed && <p role="alert">Couldn&apos;t reach Google. Try again.</p>}
    </>
  );
}
