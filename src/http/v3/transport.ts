import type { ApiResponse } from "../models";
import type { V3Context, V3Request } from "./context";

export async function v3Request(
  ctx: V3Context,
  request: V3Request,
): Promise<ApiResponse> {
  return ctx.sessionManager.request(request);
}
