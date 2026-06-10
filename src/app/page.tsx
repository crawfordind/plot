import { redirect } from "next/navigation";
import MapShell from "@/components/map/MapShell";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex h-[100dvh] flex-1 flex-col overflow-hidden">
      <MapShell userName={user.name ?? user.email} />
    </main>
  );
}
