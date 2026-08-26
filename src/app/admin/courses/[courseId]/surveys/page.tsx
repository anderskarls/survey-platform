"use client";

import { useParams } from "next/navigation";
import SurveysManager from "@/components/admin/SurveysManager";

export default function CourseSurveysPage() {
  const { courseId } = useParams();
  return (
    <SurveysManager
      apiBase={`/api/courses/${courseId}`}
      allowModeSelection
      courseId={Number(courseId)}
      resultsBasePath={`/admin/courses/${courseId}/surveys`}
    />
  );
}
