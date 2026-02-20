import type { ApiResponse } from "../../models";
import type { HTTPApiRequest } from "../../interfaces";
import { PRESET_KEYS } from "../../crypto";
import type { V3Domain, V3Request, V3SessionDeps } from "../context";
import { V3Session } from "./V3Session";

export class V3SessionManager {
  private readonly sessions = new Map<V3Domain, V3Session>();

  constructor(
    private readonly region: string,
    private readonly deps: V3SessionDeps,
  ) {}

  request(request: V3Request): Promise<ApiResponse> {
    const session = this.getSession(request.domain);
    const httpRequest: HTTPApiRequest = {
      method: request.method ?? "post",
      endpoint: request.endpoint,
      data: request.data,
    };
    return session.request(httpRequest, request.auth ?? "required");
  }

  getSession(domain: V3Domain): V3Session {
    const existing = this.sessions.get(domain);
    if (existing) return existing;

    const session = this.createSession(domain);
    this.sessions.set(domain, session);
    return session;
  }

  invalidate(domain: V3Domain): void {
    const session = this.sessions.get(domain);
    if (session) session.invalidate();
  }

  private createSession(domain: V3Domain): V3Session {
    switch (domain) {
      case "security":
        return new V3Session(
          "V3",
          PRESET_KEYS.SECURITY_PR,
          "security",
          this.region,
          this.deps,
        );
      case "house":
        return new V3Session(
          "Mega",
          PRESET_KEYS.MEGA_PR,
          "house",
          this.region,
          this.deps,
          "mega",
        );
      case "passport":
        return new V3Session(
          "Passport",
          PRESET_KEYS.MEGA_PR,
          "passport",
          this.region,
          this.deps,
          "mega",
        );
      case "mega":
        return new V3Session(
          "Mega",
          PRESET_KEYS.MEGA_PR,
          "mega",
          this.region,
          this.deps,
        );
    }
  }
}
