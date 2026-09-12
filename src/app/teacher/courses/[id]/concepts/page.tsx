import { redirect, notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { CourseAuthoringClient } from "./CourseAuthoringClient";
import { getOrEnsureProfile } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return { title: "Curriculum Authoring" };
  }

  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return {
    title: course ? `${course.title} — Curriculum Authoring` : "Curriculum Authoring",
  };
}

export default async function CourseAuthoringPage({ params }: PageProps) {
  const { id: courseId } = await params;
  if (!z.string().uuid().safeParse(courseId).success) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getOrEnsureProfile(supabase, user);
  if (profile?.role === "student") redirect("/dashboard");


  // Fetch course ensuring this teacher owns it
  const { data: course } = await supabase
    .from("courses")
    .select("id, title, subject, teacher_id")
    .eq("id", courseId)
    .eq("teacher_id", user.id)
    .maybeSingle();

  if (!course) notFound();

  // Fetch concepts
  const { data: concepts } = await supabase
    .from("concepts")
    .select("id, name, description, difficulty, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });

  const conceptList = concepts ?? [];

  // Fetch prerequisite edges
  const { data: edgesRaw } = await supabase
    .from("concept_edges")
    .select("id, prerequisite_id, concept_id, weight")
    .eq("course_id", courseId);

  const edgeList = edgesRaw ?? [];

  // Fetch questions
  const { data: questionsRaw } = await supabase
    .from("questions")
    .select("id, concept_id, question_text, options, correct_answer, explanation, difficulty, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });

  const questionList = (questionsRaw ?? []).map((q) => ({
    id: q.id,
    concept_id: q.concept_id,
    question_text: q.question_text,
    options: q.options as Array<{ key: string; text: string }>,
    correct_answer: q.correct_answer,
    explanation: q.explanation ?? undefined,
    difficulty: q.difficulty as "easy" | "medium" | "hard",
  }));

  // Fetch class mastery for concepts in this course to populate the DAG graph with genuine class averages
  const conceptIds = conceptList.map((c) => c.id);
  const { data: courseMastery } = conceptIds.length > 0
    ? await supabase
        .from("mastery")
        .select("concept_id, score, attempts_count")
        .in("concept_id", conceptIds)
    : { data: [] };

  const masteryByConcept = new Map<string, number[]>();
  for (const m of courseMastery ?? []) {
    if (!masteryByConcept.has(m.concept_id)) {
      masteryByConcept.set(m.concept_id, []);
    }
    masteryByConcept.get(m.concept_id)!.push(m.score);
  }

  const classAverageMasteryMap: Record<string, { average: number; studentCount: number }> = {};
  for (const c of conceptList) {
    const scores = masteryByConcept.get(c.id) ?? [];
    classAverageMasteryMap[c.id] = {
      average: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      studentCount: scores.length,
    };
  }

  return (
    <CourseAuthoringClient
      course={course}
      initialConcepts={conceptList}
      initialEdges={edgeList}
      initialQuestions={questionList}
      classAverageMasteryMap={classAverageMasteryMap}
    />
  );
}
