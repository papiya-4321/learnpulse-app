"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "react-toastify";

interface SyllabusIngestionModalProps {
  courseId: string;
  courseTitle: string;
  courseSubject: string;
  onSuccess?: () => void;
}

import { CURRICULUM_PRESETS } from "@/lib/constants/curriculumPresets";

export function SyllabusIngestionModal({
  courseId,
  courseTitle,
  courseSubject,
  onSuccess,
}: SyllabusIngestionModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [topicText, setTopicText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleIngest(textToIngest?: string) {
    const text = (textToIngest || topicText).trim();
    if (!text || text.length < 5) {
      setError(
        "Please select a syllabus template or enter at least 5 characters.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    // If teacher selected a preset or entered "Subject Name: ...", infer that subject title
    const inferredTitle = text.includes(":") ? text.split(":")[0].trim() : undefined;

    try {
      const res = await fetch("/api/ai/synthesize-dag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicText: text,
          courseTitle: inferredTitle || courseTitle,
          courseSubject,
          targetCourseId: courseId,
          persist: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Synthesis failed: ${res.status}`);
      }

      const count = data.concepts?.length ?? 0;
      const title = data.courseTitle || inferredTitle || "course";
      toast.success(`Successfully updated ${title} with ${count} lessons!`);
      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setTopicText("");
        if (onSuccess) onSuccess();
        window.location.reload();
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Syllabus ingestion failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        type="button"
        id="open-syllabus-ingest-btn"
        className={cn(
          buttonVariants({ size: "sm" }),
          "gap-2 rounded-md text-xs font-bold border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)] cursor-pointer"
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span>1-Click AI Ingestion</span>
      </DialogTrigger>

      <DialogContent className="max-w-xl sm:max-w-xl p-6 sm:p-7 space-y-5 rounded-xl border-2 border-border bg-card shadow-[4px_4px_0px_var(--shadow-color)]">
        {/* Header */}
        <DialogHeader className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs border-2 border-border bg-accent-yellow/20 text-[10px] font-bold text-foreground w-fit shadow-[1px_1px_0px_var(--shadow-color)]">
            <Zap className="h-3 w-3 text-primary" />
            <span>AICTE Smart Curriculum Engine</span>
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            1-Click Syllabus Ingestion
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-medium">
            Synthesize atomic concepts, prerequisite DAG edges, and diagnostic
            MCQs for{" "}
            <span className="font-bold text-foreground">
              {courseTitle}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* AICTE Presets */}
        <div className="space-y-2">
          <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
            AICTE Standard Curriculum Presets:
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {CURRICULUM_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant={topicText === preset.text ? "secondary" : "outline"}
                size="sm"
                disabled={loading}
                onClick={() => {
                  setTopicText(preset.text);
                }}
                className={cn(
                  "text-[11px] px-2.5 py-1.5 h-auto rounded-xs cursor-pointer font-bold border-1.5 text-left shadow-[1px_1px_0px_var(--shadow-color)]",
                  topicText === preset.text
                    ? "border-primary bg-primary text-primary-foreground font-bold"
                    : "border-border bg-card hover:bg-muted text-foreground",
                )}
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label
            htmlFor="syllabus-topic-input"
            className="text-xs font-bold text-foreground block uppercase tracking-wider"
          >
            Or Paste Syllabus Topics / Module Notes:
          </label>
          <Textarea
            id="syllabus-topic-input"
            value={topicText}
            onChange={(e) => setTopicText(e.target.value)}
            disabled={loading}
            rows={5}
            maxLength={1000}
            placeholder="e.g. Unit 1: Pointers and Memory Allocation, Unit 2: Linked Lists & Node Traversal, Unit 3: Binary Search Trees, Unit 4: Graph Theory & DFS/BFS..."
            className="w-full text-xs p-3 rounded-md border-2 border-border bg-card focus:outline-hidden transition-colors resize-none font-medium"
          />
        </div>

        {/* Error / Success Feedback */}
        {error && (
          <div className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2 shadow-[2px_2px_0px_var(--shadow-color)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="rounded-md border-2 border-success bg-success/15 p-3 text-xs font-bold text-foreground flex items-center gap-2 animate-fade-in shadow-[2px_2px_0px_var(--shadow-color)]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span>
              Concepts & Prerequisite DAG synthesized and saved to database!
            </span>
          </div>
        )}

        {/* Actions */}
        <DialogFooter className="flex items-center justify-end gap-3 pt-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
            disabled={loading}
            className="rounded-md text-xs font-bold cursor-pointer border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            id="confirm-ingest-syllabus-btn"
            size="sm"
            onClick={() => handleIngest()}
            disabled={loading || !topicText.trim()}
            className="gap-2 rounded-md text-xs font-bold disabled:opacity-50 cursor-pointer border-2 border-border shadow-[2px_2px_0px_var(--shadow-color)] hover:shadow-[3px_3px_0px_var(--shadow-color)]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Analyzing DAG & Ingesting…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Synthesize & Ingest</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
