"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const rawCallback = searchParams.get("callbackUrl") || "/admin";
  const callbackUrl = rawCallback.startsWith("/admin") ? rawCallback : "/admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          result.code === "rate_limit"
            ? "För många inloggningsförsök. Vänta tio minuter och försök igen."
            : "Fel e-post eller lösenord."
        );
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Enkätplattform</h1>
          <p className="text-muted text-sm mt-1">Admin-inloggning</p>
        </div>

        <div className="card p-8">
          {error && (
            <div
              className="bg-error-light text-error p-3 rounded-lg mb-4 text-sm font-medium"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold mb-1.5">
                E-post
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold mb-1.5">
                Lösenord
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? "Loggar in..." : "Logga in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
