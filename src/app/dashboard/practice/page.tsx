import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { PracticeClient } from "./PracticeClient";
import { CourseSelector } from "@/components/CourseSelector";
import { Zap, Compass, Plus } from "lucide-react";
import { calculateRetention } from "@/lib/algorithms/decay";
import { buildAdjacencyList } from "@/lib/algorithms/graph";
import { selectReviewQuestion } from "@/lib/algorithms/reviewSelection";
import { getStudentEnrolledCourseIds } from "@/lib/enrollment";
import { getOrEnsureProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ conceptId?: string; courseId?: string }>;
}

export const metadata = {
  title: "Practice — LearnPulse",
  description: "Practice questions to improve your mastery scores.",
};

export default async function PracticePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { conceptId, courseId: paramCourseId } = (await searchParams) ?? {};

  // Parallelize profile check, enrolled courses, and platform courses
  const [profile, enrolledCourseIds, coursesRes] = await Promise.all([
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
  ]);

  if (profile?.role === "teacher") {
    redirect("/teacher");
  }


  const allCourses = coursesRes.data ?? [];
  const validCourses = allCourses.filter((c) => enrolledCourseIds.includes(c.id));

  if (validCourses.length === 0) {
    return (
      <div className="px-8 py-16 max-w-2xl mx-auto text-center space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-accent-blue/20 border-2 border-border text-foreground mx-auto shadow-[2px_2px_0px_var(--shadow-color)]">
          <Compass className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {allCourses.length > 0 ? "Enroll in a Course to Practice" : "No Courses Available Yet"}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm max-w-md mx-auto leading-relaxed font-medium">
            {allCourses.length > 0
              ? "You haven't enrolled in any courses yet. Browse the course catalog to enroll in subjects of your choice and begin practice sessions."
              : "Your instructor hasn't created any courses yet. Check back soon!"}
          </p>
        </div>
        {allCourses.length > 0 && (
          <div className="pt-2">
            <Link
              href="/dashboard/courses"
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground border-2 border-border px-6 py-3 text-xs sm:text-sm font-bold shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)] transition-all"
            >
              <Plus className="h-4 w-4" />
              Browse Course Catalog ({allCourses.length} available)
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Determine selected course:
  // 1. Explicit paramCourseId if valid
  // 2. Or course of the incoming conceptId if specified
  // 3. Or database persisted selectedCourseId
  // 4. Or persisted cookie selectedCourseId
  // 5. Or first available course
  const dbCourseId = (user.user_metadata?.selectedCourseId as string) || null;
  let selectedCourseId =
    paramCourseId && validCourses.some((c) => c.id === paramCourseId)
      ? paramCourseId
      : null;

  if (!selectedCourseId && conceptId) {
    const { data: conceptRow } = await supabase
      .from("concepts")
      .select("course_id")
      .eq("id", conceptId)
      .maybeSingle();

    if (conceptRow?.course_id && validCourses.some((c) => c.id === conceptRow.course_id)) {
      selectedCourseId = conceptRow.course_id;
    }
  }

  if (!selectedCourseId && dbCourseId && validCourses.some((c) => c.id === dbCourseId)) {
    selectedCourseId = dbCourseId;
  }

  if (!selectedCourseId) {
    selectedCourseId = validCourses[0]?.id ?? null;
  }

  if (selectedCourseId && selectedCourseId !== dbCourseId) {
    await supabase.auth.updateUser({
      data: { selectedCourseId },
    });
  }

  // Fetch all concepts for the selected course
  const { data: courseConcepts } = selectedCourseId
    ? await supabase
        .from("concepts")
        .select("id, name, difficulty")
        .eq("course_id", selectedCourseId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const validConcepts = courseConcepts ?? [];
  const conceptIds = validConcepts.map((c) => c.id);

  // Fetch student's mastery for these course concepts
  const { data: masteryRows } =
    conceptIds.length > 0
      ? await supabase
          .from("mastery")
          .select("concept_id, score, attempts_count, correct_count, updated_at")
          .eq("user_id", user.id)
          .in("concept_id", conceptIds)
      : { data: [] };

  const masteryMap = new Map((masteryRows ?? []).map((m) => [m.concept_id, m]));

  interface ConceptInfo {
    id: string;
    name: string;
    score: number;
    attemptsCount: number;
    correctCount: number;
    isDue?: boolean;
    retentionScore?: number;
  }

  const conceptList: ConceptInfo[] = validConcepts.map((c) => {
    const m = masteryMap.get(c.id);
    let isDue = false;
    let retentionScore = m?.score ?? 0;

    if (m && m.updated_at) {
      const decay = calculateRetention(
        {
          masteryScore: m.score,
          lastAttemptAt: new Date(m.updated_at),
          timesCorrect: m.correct_count,
          totalAttempts: m.attempts_count,
        },
        new Date()
      );
      isDue = decay.isDue;
      retentionScore = decay.retentionScore;
    }

    return {
      id: c.id,
      name: c.name,
      score: m?.score ?? 0,
      attemptsCount: m?.attempts_count ?? 0,
      correctCount: m?.correct_count ?? 0,
      isDue,
      retentionScore,
    };
  });

  // Determine active concept:
  // 1. conceptId from params if in this course
  // 2. Otherwise concepts due for review (decayed)
  // 3. Otherwise weakest concept (< 70) or first concept in this course
  let activeConcept = conceptList.find((c) => c.id === conceptId);
  if (!activeConcept && conceptList.length > 0) {
    const dueConcept = conceptList.find((c) => c.isDue);
    if (dueConcept) {
      activeConcept = dueConcept;
    } else {
      const weakest = [...conceptList].sort((a, b) => a.score - b.score)[0];
      activeConcept = weakest ?? conceptList[0];
    }
  }

  if (!activeConcept) {
    return (
      <div className="px-8 py-8 max-w-3xl mx-auto space-y-8">
        <div className="animate-slide-up">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Practice
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Answer questions to improve your mastery scores
          </p>
        </div>

        {validCourses.length > 0 && (
          <div className="animate-slide-up">
            <CourseSelector
              courses={validCourses}
              selectedCourseId={selectedCourseId ?? ""}
              basePath="/dashboard/practice"
            />
          </div>
        )}

        <div className="border border-border/80 bg-card rounded-xl p-12 text-center space-y-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary mx-auto">
            <Zap className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">No practice material yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Your teacher hasn&apos;t added any questions to this course yet. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  // Fetch all questions for active concept
  const { data: allQuestions } = await supabase
    .from("questions")
    .select("id, question_text, options, correct_answer, explanation, difficulty")
    .eq("concept_id", activeConcept.id)
    .order("created_at", { ascending: true });

  const validQuestions = allQuestions ?? [];
  const questionIds = validQuestions.map((q) => q.id);

  // Fetch student's past successful attempts for these questions
  const { data: masteredAttempts } = questionIds.length > 0
    ? await supabase
        .from("attempts")
        .select("question_id")
        .eq("user_id", user.id)
        .eq("is_correct", true)
        .in("question_id", questionIds)
    : { data: [] };

  const masteredQuestionIds = new Set((masteredAttempts ?? []).map((a) => a.question_id));

  // Filter out questions the student has already answered correctly
  const unmasteredQuestions = validQuestions.filter((q) => !masteredQuestionIds.has(q.id));
  const isAlreadyMastered = validQuestions.length > 0 && unmasteredQuestions.length === 0;

  const baseQuestions = unmasteredQuestions.length > 0 ? unmasteredQuestions : validQuestions;

  // Interleave decay review question at index 0 if active concept is due for review
  let reviewQuestion = null;
  if (activeConcept.isDue && selectedCourseId) {
    const { data: edges } = await supabase
      .from("concept_edges")
      .select("prerequisite_id, concept_id, weight")
      .eq("course_id", selectedCourseId);

    const graph = buildAdjacencyList(edges ?? []);
    reviewQuestion = await selectReviewQuestion(
      {
        studentId: user.id,
        decayedConceptId: activeConcept.id,
        graph,
        supabase,
      },
      supabase
    );
  }

  const questionsToServe = reviewQuestion
    ? [reviewQuestion, ...baseQuestions.filter((q) => q.id !== reviewQuestion.id)]
    : baseQuestions;

  return (
    <PracticeClient
      key={activeConcept.id}
      conceptList={conceptList}
      activeConcept={activeConcept}
      questions={questionsToServe}
      allQuestions={validQuestions}
      totalConceptQuestions={validQuestions.length}
      masteredCount={masteredQuestionIds.size}
      isAlreadyMastered={isAlreadyMastered}
      initialMastery={activeConcept.score}
      userId={user.id}
      courses={validCourses}
      selectedCourseId={selectedCourseId ?? ""}
    />
  );
}
