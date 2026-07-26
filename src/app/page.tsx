import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

/** Single entry point: straight to the document list, or to sign-in. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/documents" : "/login");
}
