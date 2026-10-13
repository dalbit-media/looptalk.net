import BrowserClient from "../BrowserClient";
import "../web-app.css";

export const metadata = {
  title: "LoopTalk Messenger",
  description: "Private conversations in the LoopTalk messenger.",
  manifest: "/app/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LoopTalk",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};

export default function AppRoute() {
  return <BrowserClient />;
}
