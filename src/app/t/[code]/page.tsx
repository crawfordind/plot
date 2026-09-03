import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TagLanding from "@/components/tags/TagLanding";
import { getActiveContext } from "@/lib/auth";
import { parseTagCode } from "@/lib/tags/code";
import { resolveTag } from "@/lib/tags/resolve";

// The page a tag's URL opens. This is the cold, unauthenticated entry point the
// whole hardware story depends on: iOS reads a tag in the background and hands
// the URL to Safari with no app and no NFC API involved, so if this page needs
// anything special to work, the iPhone half of the crew is locked out.
//
// A tag carries no farm data — just an opaque code — so an unauthenticated
// visitor learns nothing here, and resolution is scoped to the viewer's own
// workspace. A code minted by another farm reads as unknown, never as someone
// else's tube.

export const metadata: Metadata = {
  title: "Tag · Plot",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ code: string }> };

export default async function TagPage({ params }: Props) {
  const { code: raw } = await params;
  const code = parseTagCode(raw) ?? raw;

  const ctx = await getActiveContext();
  if (!ctx) {
    // Sign in and come straight back to the tube they're standing at.
    redirect(`/login?next=${encodeURIComponent(`/t/${code}`)}`);
  }

  const resolution = await resolveTag(code, ctx.org.id);

  return (
    <main className="h-[100dvh] overflow-hidden">
      <TagLanding
        tagCode={code}
        initialResolution={resolution}
        crewName={ctx.user.name ?? ctx.user.email}
      />
    </main>
  );
}
