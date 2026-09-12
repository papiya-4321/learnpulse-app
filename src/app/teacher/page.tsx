import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { MasteryBar } from "@/components/mastery/MasteryBar";
import { RiskBadge } from "@/components/risk/RiskBadge";
import { getMasteryStage } from "@/lib/masteryLevels";
import { MasteryExplainerModal } from "@/components/mastery/MasteryExplainerModal";
import { cn } from "@/lib/utils";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { CourseSelector } from "@/components/CourseSelector";
import { CreateCourseModal } from "@/components/teacher/CreateCourseModal";
import { DeleteCourseButton } from "@/components/teacher/DeleteCourseButton";
import { getTeacherDashboardData } from "@/lib/teacher/dashboardService";
import { getOrEnsureProfile } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Class Overview — LearnPulse",
  description: "Read-only teacher view: class average mastery and at-risk student list.",
};

interface PageProps {
  searchParams: Promise<{ courseId?: string }>;
}

export default async function TeacherPage({ searchParams }: PageProps) {
  const { courseId: paramCourseId } = (await searchParams) ?? {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getOrEnsureProfile(supabase, user);
  if (profile?.role === "student") redirect("/dashboard");


  const dbCourseId = (user.user_metadata?.selectedCourseId as string) || null;

  const {
    validCourses,
    selectedCourse,
    selectedCourseId,
    conceptAverages,
    classStudents,
    studentRoster,
    activeStudentsInCourse,
    atRiskStudentsInCourse,
    displayClassAvg,
    displayAttemptsCount,
  } = await getTeacherDashboardData(supabase, user.id, dbCourseId, paramCourseId);

  if (validCourses.length === 0 || !selectedCourse || !selectedCourseId) {
    return (
      <div className="px-8 py-16 max-w-3xl mx-auto text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary mx-auto">
          <GraduationCap className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">No courses yet</h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Create your first course to begin tracking student risk, concept
          mastery, and prerequisite diagnostics.
        </p>
        <div className="pt-2">
          <CreateCourseModal />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Class Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            See how your class is learning, improving, and who needs help.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <MasteryExplainerModal
            buttonText="How do these scores work?"
            variant="button"
          />
          <CreateCourseModal />
        </div>
      </div>

      {/* Course selector tabs & management actions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <CourseSelector
            courses={validCourses}
            selectedCourseId={selectedCourseId}
            basePath="/teacher"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 w-full">
          <DeleteCourseButton
            key={selectedCourseId}
            courseId={selectedCourseId}
            courseTitle={selectedCourse.title}
          />
          <Link
            href={`/teacher/courses/${selectedCourseId}/concepts`}
            id="manage-curriculum-btn"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5 text-xs text-primary font-bold rounded-md border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)] cursor-pointer min-h-11 sm:min-h-0 justify-center"
            )}
          >
            Add Lessons & Quiz Questions
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Performance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Class Average */}
        <div className="rounded-xl border-2 border-border bg-card p-5 space-y-2 shadow-[2px_2px_0px_var(--shadow-color)]">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <div className="p-2 rounded-md bg-accent-yellow/20 text-foreground border-2 border-border shadow-[1px_1px_0px_var(--shadow-color)]">
                <TrendingUp className="h-4 w-4" />
              </div>
              Average Score
            </div>
            <MasteryExplainerModal variant="icon" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums">
              {displayClassAvg.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground font-bold">
              {getMasteryStage(displayClassAvg, displayAttemptsCount).stageName}
            </span>
          </div>
          <MasteryBar
            score={displayClassAvg}
            attemptsCount={displayAttemptsCount}
            showLabel={false}
            size="sm"
          />
          <p className="text-[11px] text-muted-foreground truncate font-medium">
            {activeStudentsInCourse.length > 0
              ? `In ${selectedCourse.title}`
              : `In ${selectedCourse.title} (no quizzes taken yet)`}
          </p>
        </div>

        {/* Card 2: Total Students */}
        <div className="rounded-xl border-2 border-border bg-card p-5 space-y-1 shadow-[2px_2px_0px_var(--shadow-color)]">
          <div className="flex items-center gap-2 text-foreground text-sm font-bold">
            <div className="p-2 rounded-md bg-accent-blue/20 text-foreground border-2 border-border shadow-[1px_1px_0px_var(--shadow-color)]">
              <Users className="h-4 w-4" />
            </div>
            Total Students
          </div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums pt-1">
            {classStudents.length}
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {classStudents.length === 1 ? "student joined" : "students joined"}
          </p>
        </div>

        {/* Card 3: Needs Help */}
        <div className="rounded-xl border-2 border-border bg-card p-5 space-y-1 shadow-[2px_2px_0px_var(--shadow-color)]">
          <div className="flex items-center gap-2 text-foreground text-sm font-bold">
            <div className="p-2 rounded-md bg-accent-yellow/30 text-foreground border-2 border-border shadow-[1px_1px_0px_var(--shadow-color)]">
              <AlertTriangle className="h-4 w-4 text-primary" />
            </div>
            Needs Help
          </div>
          <div
            className={cn(
              "text-3xl sm:text-4xl font-bold tracking-tight tabular-nums pt-1",
              atRiskStudentsInCourse.length > 0 ? "text-primary" : "text-success"
            )}
          >
            {atRiskStudentsInCourse.length}
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {atRiskStudentsInCourse.length === 0
              ? `No students need help in ${selectedCourse.title}`
              : `${atRiskStudentsInCourse.length} student${atRiskStudentsInCourse.length !== 1 ? "s" : ""} need extra support right now`}
          </p>
        </div>
      </div>

      {/* Topic Mastery Progress */}
      <div className="animate-slide-up space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base text-foreground">Topic Progress</h2>
          <MasteryExplainerModal variant="badge" />
        </div>
        <div className="space-y-3">
          {conceptAverages.length > 0 ? (
            conceptAverages.map((concept) => (
              <div
                key={concept.id}
                className="rounded-xl border-2 border-border bg-card p-4 space-y-2 shadow-[2px_2px_0px_var(--shadow-color)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{concept.name}</span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {concept.studentCount === 0
                      ? "No quizzes taken yet"
                      : `${concept.studentCount} student${concept.studentCount !== 1 ? "s" : ""} learning`}
                  </span>
                </div>
                <MasteryBar
                  score={concept.average}
                  attemptsCount={concept.studentCount > 0 ? 1 : 0}
                  size="sm"
                />
              </div>
            ))
          ) : (
            <div className="rounded-xl border-2 border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground font-medium shadow-[2px_2px_0px_var(--shadow-color)]">
              No lessons created for this course yet. Click &ldquo;Add Lessons &amp; Quiz Questions&rdquo; above to get started.
            </div>
          )}
        </div>
      </div>

      {/* Student Roster & Support */}
      <div className="animate-slide-up space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-bold text-base flex items-center gap-2 text-foreground">
              Student Progress &amp; Support
              <span className="text-xs font-semibold text-muted-foreground">
                ({studentRoster.length} joined)
              </span>
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Live student scores, learning progress, and individual student profiles.
            </p>
          </div>
        </div>

        {studentRoster.length > 0 && activeStudentsInCourse.length === 0 && (
          <div className="rounded-xl border-2 border-border bg-accent-yellow/15 p-4 flex items-start gap-3 shadow-[2px_2px_0px_var(--shadow-color)]">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
              <p className="font-bold text-foreground">
                No quizzes taken in {selectedCourse.title} yet
              </p>
              <p>
                All {studentRoster.length} enrolled students are listed below with their overall progress.
              </p>
            </div>
          </div>
        )}

        {studentRoster.length === 0 ? (
          <div className="rounded-xl p-10 text-center space-y-3 border-2 border-dashed border-border bg-card shadow-[2px_2px_0px_var(--shadow-color)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-blue/20 border-2 border-border text-foreground mx-auto shadow-[1px_1px_0px_var(--shadow-color)]">
              <Users className="h-6 w-6" />
            </div>
            <p className="font-bold text-sm text-foreground">
              No students enrolled in this course yet
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto font-medium">
              Students can pick {selectedCourse.title} from their Course Catalog. Once enrolled,
              their learning progress and scores will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {studentRoster.map((student, idx) => (
              <Link
                key={student.id}
                href={`/teacher/students/${student.id}?courseId=${selectedCourseId}`}
                id={`student-card-${idx}`}
                className="group flex items-center justify-between rounded-xl border-2 border-border bg-card p-4 hover:-translate-x-px hover:-translate-y-px shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)] transition-all duration-150"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-yellow/30 text-foreground border-2 border-border font-bold text-sm shadow-[1px_1px_0px_var(--shadow-color)]">
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm group-hover:text-primary transition-colors truncate text-foreground">
                        {student.name}
                      </p>
                      {!student.hasCourseAttempts && (
                        <Badge variant="outline" className="text-[10px] font-bold rounded-xs border-1.5 border-border">
                          Not started yet
                        </Badge>
                      )}
                    </div>

                    {student.hasCourseAttempts ? (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span className="font-bold text-foreground">
                          {student.courseAvgMastery.toFixed(0)}% score in this class
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground font-medium">
                        Not started yet (no quizzes taken)
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {student.hasCourseAttempts ? (
                    <RiskBadge bucket={student.courseRisk.bucket} />
                  ) : (
                    <Badge variant="outline" className="text-xs font-bold rounded-xs border-1.5 border-border">
                      Unranked
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
