"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-1 items-center justify-center bg-emerald-50 px-safe pb-safe pt-safe">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-emerald-900">Plot</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in to your farm log</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-stone-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block text-sm font-medium text-stone-700">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="touch-target w-full rounded-xl bg-emerald-600 py-4 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-500">
          New here?{" "}
          <Link href="/register" className="font-medium text-emerald-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
