import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { computeRisk, inactivityScore, declineScore } from "@/lib/algorithms/risk";
import { getDaysSince } from "@/lib/utils";
import { calculateRetention } from "@/lib/algorithms/decay";
import { getStudentEnrolledCourseIds } from "@/lib/enrollment";
import { getOrEnsureProfile } from "@/lib/auth";
import { DashboardClientView } from "./DashboardClientView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — LearnPulse",
  description: "Your learning health overview, weak concepts, and risk indicators.",
};

interface PageProps {
  searchParams: Promise<{ courseId?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { courseId: paramCourseId } = (await searchParams) ?? {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallelize initial queries (profile, enrollments, courses, recent attempts)
  const [profile, enrolledCourseIds, allCoursesRes, recentAttemptsRes] =
    await Promise.all([
      getOrEnsureProfile(supabase, user),
      getStudentEnrolledCourseIds(
        supabase,
        user.id,
        user.user_metadata
      ),
      supabase
        .from("courses")
        .select("id, title, subject")
        .order("title"),
      supabase
        .from("attempts")
        .select("is_correct, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (profile?.role === "teacher") redirect("/teacher");


  const totalPlatformCourses = allCoursesRes.data ?? [];

  // Only track and display courses the student has chosen to enroll in
  const validCourses = totalPlatformCourses.filter((c) =>
    enrolledCourseIds.includes(c.id)
  );

  // Determine selected course from URL parameter or user metadata
  const dbCourseId = (user.user_metadata?.selectedCourseId as string) || null;
  const activeCourseId =
    paramCourseId && validCourses.some((c) => c.id === paramCourseId)
      ? paramCourseId
      : dbCourseId && validCourses.some((c) => c.id === dbCourseId)
        ? dbCourseId
        : null;

  const selectedCourse = validCourses.find((c) => c.id === activeCourseId) ?? validCourses[0] ?? null;
  const selectedCourseId = selectedCourse?.id ?? null;

  // Fetch all concepts for the selected course
  const { data: courseConcepts } = selectedCourseId
    ? await supabase
        .from("concepts")
        .select("id, name, difficulty, created_at")
        .eq("course_id", selectedCourseId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const validConcepts = courseConcepts ?? [];
  const conceptIds = validConcepts.map((c) => c.id);

  // Fetch mastery records for these concepts for the current user
  const { data: masteryRows } =
    conceptIds.length > 0
      ? await supabase
          .from("mastery")
          .select("score, attempts_count, correct_count, updated_at, concept_id")
          .eq("user_id", user.id)
          .in("concept_id", conceptIds)
      : { data: [] };

  const masteryMap = new Map(
    (masteryRows ?? []).map((m) => [m.concept_id, m])
  );

  const recentAttempts = recentAttemptsRes.data;

  const masteryHistory = recentAttempts
    ? recentAttempts.map((a) => (a.is_correct ? 80 : 20))
    : [];

  // Compute per-concept risk scores for all concepts in this course
  const conceptsWithRisk = validConcepts.map((concept) => {
    const row = masteryMap.get(concept.id);
    if (!row) {
      // 0% mastery and unpracticed: technically needs attention and is At Risk
      const risk = computeRisk({
        masteryScore: 0,
        decline: 0,
        repeatedErrors: 0,
        inactivity: 1, // 30+ days idle / unpracticed
      });

      return {
        id: concept.id,
        name: concept.name,
        difficulty: concept.difficulty,
        score: 0,
        attemptsCount: 0,
        correctCount: 0,
        hasAttempted: false,
        isDue: false,
        retentionScore: 0,
        risk,
      };
    }

    const daysSinceLast = getDaysSince(row.updated_at);

    const repeatedErrors =
      row.attempts_count > 0 ? 1 - row.correct_count / row.attempts_count : 0;

    const risk = computeRisk({
      masteryScore: row.score,
      decline: declineScore(masteryHistory),
      repeatedErrors,
      inactivity: inactivityScore(daysSinceLast),
    });

    const decay = calculateRetention(
      {
        masteryScore: row.score,
        lastAttemptAt: new Date(row.updated_at),
        timesCorrect: row.correct_count,
        totalAttempts: row.attempts_count,
      },
      new Date()
    );

    return {
      id: concept.id,
      name: concept.name,
      difficulty: concept.difficulty,
      score: row.score,
      attemptsCount: row.attempts_count,
      correctCount: row.correct_count,
      hasAttempted: true,
      isDue: decay.isDue,
      retentionScore: decay.retentionScore,
      risk,
    };
  });

  const attemptedConcepts = conceptsWithRisk.filter((c) => c.hasAttempted);

  // Learning Health % = average mastery across all course concepts
  const learningHealth =
    conceptsWithRisk.length > 0
      ? conceptsWithRisk.reduce((sum, c) => sum + c.score, 0) / conceptsWithRisk.length
      : 0;

  // Any concept below 60% (including unstarted 0% concepts) needs attention
  const weakConcepts = conceptsWithRisk.filter((c) => c.score < 60);
  const atRiskCount = conceptsWithRisk.filter(
    (c) => c.risk.bucket === "At Risk" || c.risk.bucket === "Critical"
  ).length;

  return (
    <DashboardClientView
      fullName={profile.full_name}
      validCourses={validCourses}
      selectedCourseId={selectedCourseId}
      selectedCourse={selectedCourse}
      validConcepts={validConcepts}
      conceptsWithRisk={conceptsWithRisk}
      attemptedConcepts={attemptedConcepts}
      weakConcepts={weakConcepts}
      learningHealth={learningHealth}
      atRiskCount={atRiskCount}
      totalPlatformCoursesCount={totalPlatformCourses.length}
    />
  );
}





