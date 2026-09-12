"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  GitFork,
  HelpCircle,
  Trash2,
  AlertTriangle,
  Loader2,
  Layers,
} from "lucide-react";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";
import { SyllabusIngestionModal } from "@/components/teacher/SyllabusIngestionModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteCourseAction } from "@/app/actions/authoring";
import { ConceptsTab } from "@/components/teacher/authoring/ConceptsTab";
import { PrerequisitesTab } from "@/components/teacher/authoring/PrerequisitesTab";
import { QuestionsTab } from "@/components/teacher/authoring/QuestionsTab";
import type { Concept, Edge, Question } from "@/components/teacher/authoring/types";

interface CourseAuthoringClientProps {
  course: {
    id: string;
    title: string;
    subject: string;
  };
  initialConcepts: Concept[];
  initialEdges: Edge[];
  initialQuestions: Question[];
  classAverageMasteryMap?: Record<string, { average: number; studentCount: number }>;
}

export function CourseAuthoringClient({
  course,
  initialConcepts,
  initialEdges,
  initialQuestions,
  classAverageMasteryMap = {},
}: CourseAuthoringClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"concepts" | "prerequisites" | "questions">("concepts");

  const [concepts, setConcepts] = useState<Concept[]>(initialConcepts);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [courseState, setCourseState] = useState(course);
  const [deletingCourse, setDeletingCourse] = useState(false);

  // Sync state when initial props update (e.g. after AI ingestion or router.refresh)
  useEffect(() => {
    setCourseState(course);
  }, [course]);

  useEffect(() => {
    setConcepts(initialConcepts);
  }, [initialConcepts]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges]);

  useEffect(() => {
    setQuestions(initialQuestions);
  }, [initialQuestions]);

  const conceptMap = new Map(concepts.map((c) => [c.id, c.name]));

  function handleConceptAdded(newConcept: Concept) {
    setConcepts((prev) => [...prev, newConcept]);
    router.refresh();
  }

  function handleConceptDeleted(conceptId: string) {
    setConcepts((prev) => prev.filter((c) => c.id !== conceptId));
    setEdges((prev) => prev.filter((e) => e.prerequisite_id !== conceptId && e.concept_id !== conceptId));
    setQuestions((prev) => prev.filter((q) => q.concept_id !== conceptId));
    router.refresh();
  }

  function handleEdgeAdded(newEdge: Edge) {
    setEdges((prev) => [...prev, newEdge]);
    router.refresh();
  }

  function handleEdgeDeleted(edgeId: string) {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    router.refresh();
  }

  function handleQuestionAdded(newQuestion: Question) {
    setQuestions((prev) => [...prev, newQuestion]);
    router.refresh();
  }

  function handleQuestionDeleted(questionId: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    router.refresh();
  }

  function handleDeleteCourse() {
    toast(
      ({ closeToast }) => (
        <div className="space-y-3 py-1">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">
                Permanently delete &ldquo;{course.title}&rdquo;?
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This will remove all associated concepts, prerequisite dependencies, and questions.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={closeToast}
              className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                closeToast();
                setDeletingCourse(true);
                const toastId = toast.loading(`Deleting "${course.title}"...`);
                try {
                  const res = await deleteCourseAction(course.id);
                  if (res?.error) {
                    toast.update(toastId, {
                      render: `Failed to delete course: ${res.error}`,
                      type: "error",
                      isLoading: false,
                      autoClose: 4000,
                      closeButton: true,
                    });
                  } else {
                    toast.update(toastId, {
                      render: `Course "${course.title}" deleted successfully`,
                      type: "success",
                      isLoading: false,
                      autoClose: 2500,
                      closeButton: true,
                    });
                    router.push("/teacher");
                    router.refresh();
                  }
                } catch (err) {
                  console.error("Delete course error:", err);
                  toast.update(toastId, {
                    render: "Failed to delete course. Please try again.",
                    type: "error",
                    isLoading: false,
                    autoClose: 4000,
                    closeButton: true,
                  });
                } finally {
                  setDeletingCourse(false);
                }
              }}
              className="px-3.5 py-1.5 text-xs rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Yes, Delete Course
            </button>
          </div>
        </div>
      ),
      {
        toastId: `delete-course-${course.id}`,
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        closeButton: true,
      }
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          href={`/teacher?courseId=${course.id}`}
          id="back-to-class-overview"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-11 sm:min-h-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Class Overview
        </Link>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
          <SyllabusIngestionModal
            courseId={courseState.id}
            courseTitle={courseState.title}
            courseSubject={courseState.subject}
            onSuccess={() => router.refresh()}
          />
          <Badge variant="outline" className="text-xs font-bold px-3 py-1 rounded-xs border-2 border-border bg-accent-yellow/20 text-foreground shadow-[1px_1px_0px_var(--shadow-color)]">
            {courseState.subject}
          </Badge>

          <Button
            id="delete-course-btn"
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteCourse}
            disabled={deletingCourse}
            className="inline-flex items-center gap-1.5 text-xs text-destructive hover:text-destructive font-medium bg-destructive/10 hover:bg-destructive/15 border-destructive/20 h-9 sm:h-8 px-3 rounded-lg transition-colors disabled:opacity-50 cursor-pointer min-h-10 sm:min-h-0"
            title="Delete this course"
          >
            {deletingCourse ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete Course
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20 shadow-xs shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{courseState.title}</h1>
            <p className="text-sm text-muted-foreground">
              Add lessons, set up recommended learning order, and write practice quiz questions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border">
          <div className="text-center p-3 rounded-xl bg-background/50 border border-border/50">
            <p className="text-xs text-muted-foreground">Lessons</p>
            <p className="text-lg font-bold text-foreground">{concepts.length}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-background/50 border border-border/50">
            <p className="text-xs text-muted-foreground">Recommended Order</p>
            <p className="text-lg font-bold text-foreground">{edges.length}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-background/50 border border-border/50">
            <p className="text-xs text-muted-foreground">Quiz Questions</p>
            <p className="text-lg font-bold text-foreground">{questions.length}</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 snap-x">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setActiveTab("concepts")}
          id="tab-concepts"
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-none border-b-2 transition-all cursor-pointer h-auto shrink-0 snap-start min-h-11",
            activeTab === "concepts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Layers className="h-4 w-4" />
          1. Lessons ({concepts.length})
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setActiveTab("prerequisites")}
          id="tab-prerequisites"
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-none border-b-2 transition-all cursor-pointer h-auto shrink-0 snap-start min-h-11",
            activeTab === "prerequisites"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GitFork className="h-4 w-4" />
          2. Lesson Order &amp; Prerequisites ({edges.length})
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setActiveTab("questions")}
          id="tab-questions"
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-none border-b-2 transition-all cursor-pointer h-auto shrink-0 snap-start min-h-11",
            activeTab === "questions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <HelpCircle className="h-4 w-4" />
          3. Practice Questions ({questions.length})
        </Button>
      </div>

      {activeTab === "concepts" && (
        <ConceptsTab
          courseId={course.id}
          concepts={concepts}
          questions={questions}
          onConceptAdded={handleConceptAdded}
          onConceptDeleted={handleConceptDeleted}
        />
      )}

      {activeTab === "prerequisites" && (
        <PrerequisitesTab
          courseId={course.id}
          concepts={concepts}
          edges={edges}
          conceptMap={conceptMap}
          classAverageMasteryMap={classAverageMasteryMap}
          onEdgeAdded={handleEdgeAdded}
          onEdgeDeleted={handleEdgeDeleted}
          onNavigateToConcepts={() => setActiveTab("concepts")}
        />
      )}

      {activeTab === "questions" && (
        <QuestionsTab
          courseId={course.id}
          concepts={concepts}
          questions={questions}
          conceptMap={conceptMap}
          onQuestionAdded={handleQuestionAdded}
          onQuestionDeleted={handleQuestionDeleted}
        />
      )}
    </div>
  );
}
