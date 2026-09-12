import { redirect, notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { GapKnowledgeView } from "./GapKnowledgeView";
import { MasteryBar } from "@/components/mastery/MasteryBar";

import { RiskBadge } from "@/components/risk/RiskBadge";
import { computeRisk, inactivityScore } from "@/lib/algorithms/risk";
import { buildAdjacencyList, bfsPrerequisites } from "@/lib/algorithms/graph";
import { RunDiagnosisButton } from "./RunDiagnosisButton";
import { CourseSelector } from "@/components/CourseSelector";
import { MasteryExplainerModal } from "@/components/mastery/MasteryExplainerModal";
import { ArrowLeft, BookOpen, Zap } from "lucide-react";
import { getDaysSince, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { getOrEnsureProfile } from "@/lib/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ conceptId: string }>;
}

export async function generateMetadata() {
  return { title: "Gap Analysis — LearnPulse" };
}

export default async function GapDetailPage({ params }: PageProps) {
  const { conceptId } = await params;
  if (!z.string().uuid().safeParse(conceptId).success) {
    notFound();
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallelize initial queries (profile, targetConcept, courses, targetMastery)
  const [profile, targetConceptRes, coursesRes, targetMasteryRes] =
    await Promise.all([
      getOrEnsureProfile(supabase, user),
      supabase
        .from("concepts")
        .select("id, name, description, difficulty, course_id")
        .eq("id", conceptId)
        .single(),
      supabase
        .from("courses")
        .select("id, title, subject")
        .order("title"),
      supabase
        .from("mastery")
        .select("score, attempts_count, correct_count, updated_at")
        .eq("user_id", user.id)
        .eq("concept_id", conceptId)
        .maybeSingle(),
    ]);

  if (profile?.role === "teacher") redirect("/teacher");

  const targetConcept = targetConceptRes.data;
  if (!targetConcept) notFound();

  const validCourses = coursesRes.data ?? [];
  const targetMastery = targetMasteryRes.data;

  // Fetch ALL edges for this course in one query (no N+1)
  const { data: edges } = await supabase
    .from("concept_edges")
    .select("prerequisite_id, concept_id, weight")
    .eq("course_id", targetConcept.course_id);

  const adj = buildAdjacencyList(edges ?? []);
  const prereqNodes = bfsPrerequisites(conceptId, adj);
  const prereqIds = prereqNodes.map((n) => n.id);

  // Parallelize fetching prerequisite mastery and concept names
  const [prereqMasteryRes, prereqConceptsRes] = await Promise.all([
    prereqIds.length > 0
      ? supabase
          .from("mastery")
          .select("concept_id, score")
          .eq("user_id", user.id)
          .in("concept_id", prereqIds)
      : Promise.resolve({ data: [] as Array<{ concept_id: string; score: number }> }),
    prereqIds.length > 0
      ? supabase
          .from("concepts")
          .select("id, name, difficulty")
          .in("id", prereqIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; difficulty: string }> }),
  ]);

  const masteryMap = new Map(
    (prereqMasteryRes.data ?? []).map((m) => [m.concept_id, m.score])
  );

  const conceptNameMap = new Map(
    (prereqConceptsRes.data ?? []).map((c) => [c.id, c.name])
  );

  // Build chain nodes for rendering
  const chainNodes = [
    {
      id: conceptId,
      name: targetConcept.name,
      mastery: targetMastery?.score ?? 0,
      depth: 0,
      isTarget: true,
    },
    ...prereqNodes.map((n) => ({
      id: n.id,
      name: conceptNameMap.get(n.id) ?? n.id,
      mastery: masteryMap.get(n.id) ?? 0,
      depth: n.depth,
    })),
  ];

  // Compute risk for target concept
  const daysSinceLast = getDaysSince(targetMastery?.updated_at);
  const repeatedErrors =
    (targetMastery?.attempts_count ?? 0) > 0
      ? 1 - (targetMastery?.correct_count ?? 0) / targetMastery!.attempts_count
      : 0;
  const risk = computeRisk({
    masteryScore: targetMastery?.score ?? 0,
    decline: 0,
    repeatedErrors,
    inactivity: inactivityScore(daysSinceLast),
  });

  // Build diagnosis input for the button
  const diagnosisInput = {
    targetConceptId: conceptId,
    targetConceptName: targetConcept.name,
    targetMastery: targetMastery?.score ?? 0,
    courseId: targetConcept.course_id,
    prerequisites: prereqNodes.map((n) => ({
      conceptId: n.id,
      concept: conceptNameMap.get(n.id) ?? n.id,
      mastery: masteryMap.get(n.id) ?? 0,
      edgeWeight: n.weight,
    })),
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      {/* Back */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href={`/dashboard?courseId=${targetConcept.course_id}`}
          id="back-to-dashboard"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-2 text-sm text-muted-foreground hover:text-foreground min-h-11 sm:min-h-0 items-center"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <MasteryExplainerModal buttonText="How is Mastery calculated?" variant="button" />
        </div>
      </div>

      {/* Course selector tabs */}
      {validCourses.length > 0 && (
        <div className="animate-slide-up">
          <CourseSelector
            courses={validCourses}
            selectedCourseId={targetConcept.course_id}
            basePath="/dashboard"
          />
        </div>
      )}

      {/* Target concept header */}
      <div className="rounded-xl border-2 border-border bg-card p-6 space-y-4 animate-slide-up shadow-[4px_4px_0px_var(--shadow-color)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{targetConcept.name}</h1>
            {targetConcept.description && (
              <p className="text-sm text-muted-foreground mt-1 font-medium">
                {targetConcept.description}
              </p>
            )}
          </div>
          <RiskBadge bucket={risk.bucket} />
        </div>

        <MasteryBar
          score={targetMastery?.score ?? 0}
          attemptsCount={targetMastery?.attempts_count ?? 0}
          correctCount={targetMastery?.correct_count ?? 0}
          showAccuracySubtitle={true}
          size="lg"
        />

        <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium pt-1 border-t-2 border-border/40">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary" />
            {targetMastery?.attempts_count ?? 0} attempts
          </span>
          <span className="capitalize">{targetConcept.difficulty} difficulty</span>
        </div>
      </div>

      {/* Prerequisite knowledge visualization & 60-Second Concept Bite */}
      <div className="animate-slide-up">
        <GapKnowledgeView
          nodes={chainNodes}
          edges={(edges ?? [])
            .filter(
              (e) =>
                chainNodes.some((n) => n.id === e.prerequisite_id) &&
                chainNodes.some((n) => n.id === e.concept_id)
            )
            .map((e) => ({
              fromId: e.prerequisite_id,
              toId: e.concept_id,
              weight: e.weight,
            }))}
          courseId={targetConcept.course_id}
          targetConcept={{
            id: targetConcept.id,
            name: targetConcept.name,
            description: targetConcept.description,
          }}
        />
      </div>


      {/* Actions */}
      <div className="flex flex-wrap gap-3 animate-slide-up">
        <RunDiagnosisButton
          diagnosisInput={diagnosisInput}
          userId={user.id}
        />
        <Link
          href={`/dashboard/practice?conceptId=${conceptId}&courseId=${targetConcept.course_id}`}
          id="gap-practice-btn"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "gap-2 text-sm font-bold rounded-md border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)] cursor-pointer"
          )}
        >
          <Zap className="h-4 w-4" />
          Practice Now
        </Link>
      </div>
    </div>
  );
}
