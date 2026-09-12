import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { getOrEnsureProfile } from "@/lib/auth";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getOrEnsureProfile(supabase, user);

  if (profile?.role === "student") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen overflow-x-hidden bg-background relative">
      <AnimatedBackground />
      <Sidebar role="teacher" fullName={profile.full_name || "Teacher"} />

      <main className="flex-1 min-w-0 lg:h-screen lg:overflow-y-auto scrollbar-thin relative z-10 pb-safe">
        {children}
      </main>
    </div>
  );
}
