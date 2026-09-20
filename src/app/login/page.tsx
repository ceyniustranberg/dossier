import type { Metadata } from "next";
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
          Research boards are private to this desk. Sign in with a link sent to your email.
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
