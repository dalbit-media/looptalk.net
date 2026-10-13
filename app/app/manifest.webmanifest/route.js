import webManifest from "../../../mobile/manifest.json";

export function GET() {
  return new Response(JSON.stringify(webManifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
