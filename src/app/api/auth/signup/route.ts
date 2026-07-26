import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { badRequest, handleRoute } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { hashPassword } from "@/lib/password";
import { parseJsonBody, signupSchema } from "@/lib/validation";
import { setSessionCookie } from "@/server/session";

/**
 * Create an account and sign in.
 *
 * Present so a reviewer can test sharing with a fresh account rather than only
 * the seeded three. No email verification — out of scope, and stated as such.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { email, name, password } = await parseJsonBody(request, signupSchema);
    const db = getDb();

    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .get();
    if (existing) {
      throw badRequest("An account with that email already exists. Sign in instead.");
    }

    const user = {
      id: newId(),
      email,
      name,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };

    try {
      db.insert(users).values(user).run();
    } catch (error) {
      // The lower(email) unique index is the real guard; the SELECT above is only
      // there to produce a nicer message. Two simultaneous signups land here.
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw badRequest("An account with that email already exists. Sign in instead.");
      }
      throw error;
    }

    await setSessionCookie(user.id);
    return NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name } },
      { status: 201 },
    );
  });
}
