"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <form action={action} className="login-form">
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@example.com"
        disabled={pending}
      />
      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      {state && (
        <p className={state.ok ? "login-note" : "login-error"} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
