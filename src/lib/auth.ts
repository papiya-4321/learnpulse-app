import { createClient } from "@/utils/supabase/server";

export type UserRole = "student" | "teacher";

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
}

/**
 * Fetch profile with automatic fallback/recovery from user_metadata.
 * Prevents unnecessary kicks/redirects to /login when profile row creation lagged or was missing.
 */
export async function getOrEnsureProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
): Promise<UserProfile> {

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role) {
      return profile as UserProfile;
    }

    // Fallback: restore from auth metadata
    const fallbackRole =
      (user.user_metadata?.role as UserRole) || "student";
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split("@")[0] ||
      "User";

    await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        role: fallbackRole,
      },
      { onConflict: "id" }
    );

    const { data: refetched } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (refetched?.role) {
      return refetched as UserProfile;
    }

    return {
      id: user.id,
      full_name: fullName,
      role: fallbackRole,
    };
  } catch (err) {
    console.error("[getOrEnsureProfile] Error fetching/restoring profile:", err);
    const fallbackRole =
      (user.user_metadata?.role as UserRole) || "student";
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split("@")[0] ||
      "User";

    return {
      id: user.id,
      full_name: fullName,
      role: fallbackRole,
    };
  }
}

export async function requireAuth(requiredRole?: UserRole) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const profile = await getOrEnsureProfile(supabase, user);

  if (requiredRole && profile?.role !== requiredRole) {
    throw new Error(`Forbidden: ${requiredRole} role required`);
  }

  return { supabase, user, profile };
}

