import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getStudentEnrolledCourseIds } from "@/lib/enrollment";
import { getOrEnsureProfile } from "@/lib/auth";
import { CourseCatalogClient, type CatalogCourse } from "./CourseCatalogClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Course Catalog — LearnPulse",
  description: "Browse, enroll, and manage your active courses.",
};

export default async function CourseCatalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. Parallelize initial queries (profile, enrollments, courses)
  const [profile, enrolledIds, coursesDataRes] = await Promise.all([
    getOrEnsureProfile(supabase, user),
    getStudentEnrolledCourseIds(
      supabase,
      user.id,
      user.user_metadata
    ),
    supabase
      .from("courses")
      .select("id, title, subject, teacher_id")
      .order("title"),
  ]);

  if (profile?.role === "teacher") redirect("/teacher");


  const courses = coursesDataRes.data ?? [];

  // 2. Fetch teacher profiles and concepts concurrently
  const teacherIds = Array.from(new Set(courses.map((c) => c.teacher_id).filter(Boolean)));
  const courseIds = courses.map((c) => c.id);

  const [teachersRes, conceptsRes] = await Promise.all([
    teacherIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", teacherIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    courseIds.length > 0
      ? supabase.from("concepts").select("id, course_id").in("course_id", courseIds)
      : Promise.resolve({ data: [] as Array<{ id: string; course_id: string }> }),
  ]);

  const teachersData = teachersRes.data ?? [];
  const conceptsData = conceptsRes.data ?? [];

  const teacherMap = new Map<string, string>();
  for (const t of teachersData) {
    teacherMap.set(t.id, t.full_name);
  }

  const conceptCountMap = new Map<string, number>();
  const allConceptIds: string[] = [];
  const conceptToCourseMap = new Map<string, string>();

  for (const concept of conceptsData ?? []) {
    conceptCountMap.set(
      concept.course_id,
      (conceptCountMap.get(concept.course_id) || 0) + 1
    );
    allConceptIds.push(concept.id);
    conceptToCourseMap.set(concept.id, concept.course_id);
  }

  // Count questions mapped to course
  const { data: questionsData } =
    allConceptIds.length > 0
      ? await supabase.from("questions").select("id, concept_id").in("concept_id", allConceptIds)
      : { data: [] };

  const questionCountMap = new Map<string, number>();
  for (const q of questionsData ?? []) {
    const cid = conceptToCourseMap.get(q.concept_id);
    if (cid) {
      questionCountMap.set(cid, (questionCountMap.get(cid) || 0) + 1);
    }
  }

  // 5. Build catalog courses list (sanitize enrolled IDs to only valid existing courses)
  const activeCourseIdSet = new Set(courses.map((c) => c.id));
  const validEnrolledIds = enrolledIds.filter((id) => activeCourseIdSet.has(id));

  const catalogCourses: CatalogCourse[] = courses.map((c) => {
    const isEnrolled = validEnrolledIds.includes(c.id);
    return {
      id: c.id,
      title: c.title,
      subject: c.subject || "General",
      teacherName: teacherMap.get(c.teacher_id) || "Prof Sandip Ghosal",
      conceptCount: conceptCountMap.get(c.id) || 0,
      questionCount: questionCountMap.get(c.id) || 0,
      isEnrolled,
    };
  });

  return (
    <CourseCatalogClient
      courses={catalogCourses}
      initialEnrolledIds={validEnrolledIds}
    />
  );
}
