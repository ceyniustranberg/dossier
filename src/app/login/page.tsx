import type { Metadata } from "next";
import { openSignups } from "@/lib/supabase/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Dossier" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = Array.isArray(error) ? error[0] : error;

  return (
    <main className="login">
      <div className="login-card">
        <h1>Dossier</h1>
        <p className="login-sub">
          Sign in to get the token that connects your agent. {openSignups() ? "No password: " : "Dossier is invite-only for now; "}we’ll email you a sign-in link.
        </p>
        <LoginForm />
        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
