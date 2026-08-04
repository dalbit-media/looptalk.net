import { redirect } from "next/navigation";

export const metadata = { title: "LoopTalk", robots: { index: false, follow: false } };

export default function WebClientPage() {
  redirect("/app");
}