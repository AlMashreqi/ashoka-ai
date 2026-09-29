import { z } from "zod";

import { createAdminSession, secretsMatch, sessionCookie } from "../../../../lib/admin-session";
import { getConfig } from "../../../../lib/config";

const bodySchema = z.object({ secret: z.string().min(1) });

export interface AdminLoginDependencies {
  secret: string;
  now?(): number;
  maxAgeSeconds?: number;
}

export function createAdminLoginHandler(deps: AdminLoginDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const submitted = bodySchema.parse(await request.json()).secret;
      if (!secretsMatch(submitted, deps.secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const maxAgeSeconds = deps.maxAgeSeconds ?? 3_600;
      const token = createAdminSession(deps.secret, deps.now?.(), maxAgeSeconds);
      return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, request, maxAgeSeconds) } });
    } catch {
      return Response.json({ error: "Invalid login" }, { status: 400 });
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  const config = getConfig(process.env);
  return createAdminLoginHandler({ secret: config.adminSecret })(request);
}
