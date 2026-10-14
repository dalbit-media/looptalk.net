import BrowserClient from "../BrowserClient";
import "../web-app.css";

export const metadata = {
  title: "LoopTalk Web",
  robots: { index: false, follow: false },
};

export default function AppRoute() {
  return <BrowserClient />;
}
