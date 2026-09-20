import { signOut } from "@/app/login/actions";
import { verifySession } from "@/lib/auth";

/** Small fixed control. Renders nothing when auth is switched off, so the unconfigured
 *  prototype looks exactly as it did before. */
export async function SignOut() {
  const session = await verifySession();
  if (session.mode !== "on" || !session.user) return null;

  return (
    <form action={signOut} className="signout">
      <span title={session.user.email ?? ""}>{session.user.email}</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
