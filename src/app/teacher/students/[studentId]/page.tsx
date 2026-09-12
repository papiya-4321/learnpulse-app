import { redirect, notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { MasteryBar } from "@/components/mastery/MasteryBar";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { computeRisk, inactivityScore } from "@/lib/algorithms/risk";
import { getAccuracyText, getMasteryStage } from "@/lib/masteryLevels";
import { MasteryExplainerModal } from "@/components/mastery/MasteryExplainerModal";
import { ArrowLeft, BookOpen, Shield } from "lucide-react";
import { getDaysSince, cn } from "@/lib/utils";
import { CourseSelector } from "@/components/CourseSelector";
import { getStudentEnrolledCourseIds } from "@/lib/enrollment";
import { getOrEnsureProfile } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";

interface PageProps {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ courseId?: string }>;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "bg-success/10 text-success border-success/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  hard: "bg-destructive/10 text-destructive border-destructive/30",
};

export default async function TeacherStudentPage({
  params,
  searchParams,
}: PageProps) {
  const { studentId } = await params;
  if (!z.string().uuid().safeParse(studentId).success) {
    notFound();
  }

  const rawCourseId = (await searchParams)?.courseId;
  const paramCourseId =
    rawCourseId && z.string().uuid().safeParse(rawCourseId).success
      ? rawCourseId
      : undefined;

  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallelize initial queries (teacher role, student profile, student enrollments, teacher courses)
  const [teacherProfile, studentProfileRes, studentEnrolledCourseIds, coursesRes] =
    await Promise.all([
      getOrEnsureProfile(supabase, user),
      supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", studentId)
        .single(),
      getStudentEnrolledCourseIds(supabase, studentId),
      supabase
        .from("courses")
        .select("id, title, subject")
        .eq("teacher_id", user.id)
        .order("title"),
    ]);

  if (teacherProfile?.role === "student") redirect("/dashboard");

  const studentProfile = studentProfileRes.data;
  if (!studentProfile || studentProfile.role !== "student") notFound();

  const allTeacherCourses = coursesRes.data ?? [];
  const validCourses = allTeacherCourses.filter((c) =>
    studentEnrolledCourseIds.includes(c.id)
  );

  const selectedCourse =
    paramCourseId && validCourses.some((c) => c.id === paramCourseId)
      ? validCourses.find((c) => c.id === paramCourseId)!
      : validCourses[0] ?? null;

  const selectedCourseId = selectedCourse?.id;

  // Fetch ALL concepts in the selected course to ensure complete curriculum alignment
  const { data: allCourseConcepts } = selectedCourseId
    ? await supabase
        .from("concepts")
        .select("id, name, difficulty, course_id, created_at")
        .eq("course_id", selectedCourseId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const courseConcepts = allCourseConcepts ?? [];
  const conceptIds = courseConcepts.map((c) => c.id);

  // Fetch genuine student mastery records for this course's concepts
  const { data: masteryRows } =
    conceptIds.length > 0
      ? await supabase
          .from("mastery")
          .select(
            "concept_id, score, attempts_count, correct_count, updated_at",
          )
          .eq("user_id", studentId)
          .in("concept_id", conceptIds)
      : { data: [] };

  const masteryMap = new Map(
    (masteryRows ?? []).map((m) => [m.concept_id, m]),
  );

  // Synchronize every concept in the curriculum with the student's actual performance
  const conceptsWithRisk = courseConcepts.map((concept) => {
    const row = masteryMap.get(concept.id);
    const isAttempted = !!row && (row.attempts_count ?? 0) > 0;

    let risk: ReturnType<typeof computeRisk> | null = null;
    if (isAttempted && row) {
      const daysSinceLast = getDaysSince(row.updated_at);
      const repeatedErrors =
        row.attempts_count > 0
          ? 1 - (row.correct_count ?? 0) / row.attempts_count
          : 0;

      risk = computeRisk({
        masteryScore: row.score,
        decline: 0,
        repeatedErrors,
        inactivity: inactivityScore(daysSinceLast),
      });
    }

    return {
      id: concept.id,
      name: concept.name,
      difficulty: concept.difficulty as "easy" | "medium" | "hard",
      score: row?.score ?? 0,
      attemptsCount: row?.attempts_count ?? 0,
      correctCount: row?.correct_count ?? 0,
      isAttempted,
      risk,
    };
  });

  const attemptedConcepts = conceptsWithRisk.filter(
    (c): c is typeof c & { risk: ReturnType<typeof computeRisk> } =>
      c.isAttempted && c.risk !== null,
  );
  const weakConcepts = attemptedConcepts.filter((c) => c.score < 60);
  const avgMastery =
    attemptedConcepts.length > 0
      ? attemptedConcepts.reduce((sum, c) => sum + c.score, 0) /
        attemptedConcepts.length
      : 0;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Back button and Explainer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href={selectedCourseId ? `/teacher?courseId=${selectedCourseId}` : "/teacher"}
          id="back-to-class"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-2 text-sm text-muted-foreground hover:text-foreground min-h-11 sm:min-h-0 items-center"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Class Overview
        </Link>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <MasteryExplainerModal
            buttonText="How do these scores work?"
            variant="button"
          />
        </div>
      </div>

      {/* Student header */}
      <div className="rounded-xl p-6 sm:p-7 space-y-5 animate-slide-up border-2 border-border bg-card shadow-[3px_3px_0px_var(--shadow-color)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary border-2 border-border text-base font-display font-bold shadow-[1px_1px_0px_var(--shadow-color)]">
              {studentProfile.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{studentProfile.full_name}</h1>
              <p className="text-xs text-muted-foreground font-medium">
                Student learning overview &amp; progress
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground border-2 border-border rounded-xs px-3 py-1.5 bg-background/50 shadow-[1px_1px_0px_var(--shadow-color)]">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Teacher View
          </div>
        </div>

        {/* Subject switcher tabs */}
        {validCourses.length > 0 && selectedCourseId && (
          <div className="pt-1 border-t-2 border-border/40">
            <CourseSelector
              courses={validCourses}
              selectedCourseId={selectedCourseId}
              basePath={`/teacher/students/${studentId}`}
              label="Enrolled courses"
            />
          </div>
        )}

        {/* Average Mastery for selected subject */}
        {selectedCourse && (
          <div className="space-y-2 pt-2 border-t-2 border-border/40">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-bold">
                Average Score in {selectedCourse.title}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-base text-foreground tabular-nums">
                  {avgMastery.toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground font-bold">
                  {attemptedConcepts.length > 0
                    ? getMasteryStage(avgMastery, attemptedConcepts.length).stageName
                    : "No Quizzes Taken Yet"}
                </span>
              </div>
            </div>
            <MasteryBar
              score={avgMastery}
              attemptsCount={attemptedConcepts.length > 0 ? attemptedConcepts.length : 0}
              showLabel={false}
              size="md"
            />
          </div>
        )}
      </div>

      {validCourses.length === 0 ? (
        <div className="rounded-xl p-8 text-center space-y-4 border-2 border-dashed border-border bg-card shadow-[2px_2px_0px_var(--shadow-color)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted border-2 border-border text-muted-foreground mx-auto shadow-[1px_1px_0px_var(--shadow-color)]">
            <BookOpen className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">
            No Enrolled Courses
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto font-medium">
            {studentProfile.full_name} has not enrolled in any of your courses yet.
          </p>
          <div className="pt-2">
            <Link
              href="/teacher"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-2 text-xs font-semibold text-primary"
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to Class Overview
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Weak concepts needing intervention */}
      {weakConcepts.length > 0 && (
        <div className="animate-slide-up space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base text-destructive flex items-center gap-2">
              Topics Needing Extra Help
              <Badge variant="destructive" className="text-xs text-white">
                {weakConcepts.length} Needs Help
              </Badge>
            </h2>
          </div>
          <div className="space-y-3">
            {weakConcepts.map((concept, idx) => (
              <div
                key={concept.id}
                id={`teacher-concept-weak-${idx}`}
                className="rounded-xl border-2 border-destructive/60 bg-card p-4 space-y-2.5 shadow-[2px_2px_0px_var(--shadow-color)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">
                      {concept.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-xs border-1.5 border-border font-bold capitalize shadow-[1px_1px_0px_var(--shadow-color)]",
                        DIFFICULTY_COLOR[concept.difficulty] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {concept.difficulty}
                    </span>
                  </div>
                  <RiskBadge bucket={concept.risk.bucket} />
                </div>
                <MasteryBar
                  score={concept.score}
                  attemptsCount={concept.attemptsCount}
                  correctCount={concept.correctCount}
                  size="sm"
                />
                <div className="text-[11px] text-muted-foreground font-medium">
                  {getAccuracyText(
                    concept.correctCount,
                    concept.attemptsCount,
                    concept.score,
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Curriculum Breakdown: Displays ALL Concepts of the Subject */}
      <div className="animate-slide-up space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2 text-foreground font-heading">
            All Class Topics
            <span className="text-xs font-normal text-muted-foreground">
              ({conceptsWithRisk.length} topics in {selectedCourse?.title ?? "Course"})
            </span>
          </h2>
        </div>

        {conceptsWithRisk.length > 0 ? (
          <div className="space-y-3">
            {conceptsWithRisk.map((concept) => (
              <div
                key={concept.id}
                className={cn(
                  "rounded-xl border-2 border-border bg-card p-4 space-y-2.5 shadow-[2px_2px_0px_var(--shadow-color)] transition-colors",
                  !concept.isAttempted && "opacity-75 bg-muted/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {concept.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-xs border font-medium capitalize",
                        DIFFICULTY_COLOR[concept.difficulty] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {concept.difficulty}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {concept.isAttempted && concept.risk ? (
                      <RiskBadge bucket={concept.risk.bucket} />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Pending Practice
                      </Badge>
                    )}
                  </div>
                </div>

                {concept.isAttempted ? (
                  <>
                    <MasteryBar
                      score={concept.score}
                      attemptsCount={concept.attemptsCount}
                      correctCount={concept.correctCount}
                      size="sm"
                    />
                    <div className="text-[11px] text-muted-foreground font-medium">
                      {getAccuracyText(
                        concept.correctCount,
                        concept.attemptsCount,
                        concept.score,
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground italic pt-1">
                    Student has not attempted practice questions for this concept yet.
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-8 text-center text-muted-foreground text-sm border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)]">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            No concepts authored for this course yet.
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
