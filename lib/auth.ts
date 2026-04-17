import { NextRequest } from "next/server";

export function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.QATOOL_API_KEY;
  if (!expected) return true;
  const header = req.headers.get("x-qatool-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected;
}

export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" }
  });
}
