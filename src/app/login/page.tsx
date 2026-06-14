"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      toast.success("Welcome back");
      router.push("/");
      router.refresh();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't sign you in.");
      setError(message);
      toast.error("Sign in failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-1 items-center justify-center bg-emerald-50 px-safe pb-safe pt-safe">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Icon name="leaf" size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-emerald-900">Plot</h1>
            <p className="text-sm text-stone-500">Your farm, mapped.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@farm.com"
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
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
