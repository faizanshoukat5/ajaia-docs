import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AppError, handleRoute } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation";
import { parseJsonBody } from "@/lib/validation";
import { checkLoginAttempt, clearLoginAttempts } from "@/server/ratelimit";
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/server/session";

/** Who am I? Used by the client to render the account menu. */
export async function GET() {
  return handleRoute(async () => {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  });
}

/** Sign in. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { email, password } = await parseJsonBody(request, loginSchema);

    // Key the throttle on the account being targeted, so one attacker cannot lock
    // every account by cycling emails from one IP, and cannot bypass the limit by
    // rotating IPs against one account.
    checkLoginAttempt(`login:${email}`);

    const db = getDb();
    const user = db
      .select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .get();

    // One message for "no such user" and "wrong password" so the endpoint does not
    // confirm which emails have accounts.
    const invalid = new AppError(401, "invalid_credentials", "That email or password is not correct.");
    if (!user) throw invalid;
    if (!verifyPassword(password, user.passwordHash)) throw invalid;

    clearLoginAttempts(`login:${email}`);
    await setSessionCookie(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  });
}

/** Sign out. */
export async function DELETE() {
  return handleRoute(async () => {
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  });
}
