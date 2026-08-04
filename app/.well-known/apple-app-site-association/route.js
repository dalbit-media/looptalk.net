export async function GET() {
  if (!process.env.APPLE_TEAM_ID) return new Response(null, { status: 404 });
  return Response.json({
    applinks: {
      apps: [],
      details: [{
        appID: `${process.env.APPLE_TEAM_ID}.com.looptalk.app`,
        paths: ["/app/register*"],
      }],
    },
  }, { headers: { "cache-control": "public, max-age=3600" } });
}