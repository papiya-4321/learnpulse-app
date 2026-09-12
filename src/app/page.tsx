import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getOrEnsureProfile } from "@/lib/auth";

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getOrEnsureProfile(supabase, user);

  if (profile?.role === "teacher") redirect("/teacher");
  redirect("/dashboard");
}

