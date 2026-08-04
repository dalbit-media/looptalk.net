export async function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 || "")
    .split(",")
    .map((fingerprint) => fingerprint.trim())
    .filter(Boolean);
  if (!fingerprints.length) return new Response(null, { status: 404 });
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.looptalk.app",
      sha256_cert_fingerprints: fingerprints,
    },
  }], { headers: { "cache-control": "public, max-age=3600" } });
}