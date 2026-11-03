import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const worker = await readFile(path.join(process.cwd(), "mobile", "web", "push-sw.js"), "utf8");
  return new Response(worker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/app/",
    },
  });
}
