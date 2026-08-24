import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminScope } from "@/lib/require-auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  // Samma DB-baserade uppslag som adminlayouten gör, inte bara en koll att
  // cookien finns. Med enbart sessionskollen skulle ett borttaget konto med
  // kvarvarande cookie studsa i evighet: hit -> /admin -> hit igen.
  const scope = await getAdminScope();
  if (scope && scope !== "invalid-key") {
    redirect("/admin");
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-muted">Laddar...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
