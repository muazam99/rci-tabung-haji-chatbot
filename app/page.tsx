"use client";

import dynamic from "next/dynamic";

// The workspace (PDF flipbook + chat) is canvas- and viewport-driven end to
// end — nothing in it benefits from a server render, and doing one would
// just create a hydration mismatch to work around (see workspace.tsx).
const Workspace = dynamic(() => import("@/components/workspace/workspace").then((m) => m.Workspace), {
  ssr: false,
});

export default function Home() {
  return <Workspace />;
}
