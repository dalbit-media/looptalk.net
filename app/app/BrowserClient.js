"use client";

import dynamic from "next/dynamic";

const ExpoWebApp = dynamic(() => import("../../web/App"), {
  ssr: false,
  loading: () => <div className="expo-web-loading" />,
});

export default function BrowserClient() {
  return (
    <main className="expo-web-host" aria-label="LoopTalk web application">
      <ExpoWebApp />
    </main>
  );
}
