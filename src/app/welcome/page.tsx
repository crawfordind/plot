import { redirect } from "next/navigation";

// The landing page now lives at the public root (`/`). Keep `/welcome` working
// as a permanent redirect so old links resolve to the canonical URL.
export default function WelcomePage() {
  redirect("/");
}
