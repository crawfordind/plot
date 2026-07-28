import type { Metadata } from "next";
import MapShell from "@/components/map/MapShell";
import { getCurrentUser } from "@/lib/auth";
import WelcomeLanding from "@/components/landing/WelcomeLanding";

// The root is the public homepage. These tags describe the marketing landing
// shown to anonymous visitors (the app view is behind auth and not indexed).
export const metadata: Metadata = {
  title: "Plot — Map-first farm & homestead manager",
  description:
    "Draw your land on a map, log work in plain English, and run an NRCS rotational-grazing plan. Local-first, open source (AGPL-3.0). No subscription.",
  openGraph: {
    title: "Plot — Map-first farm & homestead manager",
    description:
      "Draw your land, log it in plain English, and own your data. Local-first, open-source farm & homestead management.",
    type: "website",
  },
};

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return <WelcomeLanding />;
  }

  return (
    <main className="flex h-[100dvh] flex-1 flex-col overflow-hidden">
      <MapShell userName={user.name ?? user.email} />
    </main>
  );
}
