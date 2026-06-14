import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `sharp` (used by the photo-analysis route to prep images for the vision LLM)
  // is a native addon: its JS binding dlopen()s a sibling libvips shared object.
  // Next's output file tracing bundles the .node binding but can miss the .so, so
  // on Vercel the analyze function fails with
  //   ERR_DLOPEN_FAILED: libvips-cpp.so...: cannot open shared object file
  // Force the linux-x64 sharp + libvips packages (Vercel's runtime) into that
  // function's trace. These dirs only exist on linux installs, so the globs are
  // simply no-ops locally on macOS/Windows.
  outputFileTracingIncludes: {
    "/api/attachments/\\[id\\]/analyze": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
