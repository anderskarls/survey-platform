import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ownCoursesWhere, scopeIsOwner } from "@/lib/authz";
import { requirePageScope } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const scope = await requirePageScope();
  const arAgare = scopeIsOwner(scope);

  const courses = await prisma.course.findMany({
    where: ownCoursesWhere(scope),
    include: {
      _count: { select: { topics: true, surveys: true } },
      surveys: {
        include: { _count: { select: { responses: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mina kurser</h1>
          <p className="text-muted text-sm mt-1">{courses.length} kurser</p>
        </div>
        {arAgare && (
          <Link href="/admin/courses/new" className="btn-primary">
            Skapa ny kurs
          </Link>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-4 opacity-40">&#128218;</div>
          <p className="text-muted mb-4">
            {arAgare
              ? "Inga kurser skapade ännu."
              : "Du har inte tilldelats någon kurs ännu."}
          </p>
          {arAgare && (
            <Link href="/admin/courses/new" className="text-primary font-semibold hover:underline">
              Skapa din första kurs
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course, i) => {
            const totalResponses = course.surveys.reduce(
              (sum, s) => sum + s._count.responses,
              0
            );
            return (
              <Link
                key={course.id}
                href={`/admin/courses/${course.id}`}
                className="card card-hover p-6 block"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <h2 className="text-lg font-semibold mb-1 tracking-tight">{course.name}</h2>
                <div className="text-xs text-muted mb-4 font-mono tracking-wider">
                  {course.code}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: course._count.topics, label: "Ämnen" },
                    { value: course._count.surveys, label: "Enkäter" },
                    { value: totalResponses, label: "Svar" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="text-2xl font-bold text-primary">{s.value}</div>
                      <div className="text-muted text-xs mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-light mt-4 pt-3 border-t border-border-light">
                  Skapad {new Date(course.createdAt).toLocaleDateString("sv-SE")}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
