import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { SEED_PASSWORD, SEED_USERS } from "@/lib/demo-accounts";
import { getCurrentUser } from "@/server/session";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/documents");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ajaia Docs</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          A lightweight collaborative document editor.
        </p>
      </div>

      <LoginForm
        demoUsers={SEED_USERS.map((u) => ({ email: u.email, name: u.name }))}
        demoPassword={SEED_PASSWORD}
      />
    </main>
  );
}
