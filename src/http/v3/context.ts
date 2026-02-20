import type { V3SessionManager } from "./session/V3SessionManager";

export type V3Domain = "security" | "mega" | "house" | "passport";

export type V3Auth = "required" | "optional" | "none";

export interface V3Request {
  domain: V3Domain;
  endpoint: string;
  method?: "get" | "post";
  data?: unknown;
  auth?: V3Auth;
}

export interface V3SessionDeps {
  getToken(): string | null;
  getUserId(): string | undefined;
  getHeaders(): Record<string, string | undefined>;
  invalidateToken(): void;
  ensureLogin?(): Promise<void>;
  emit(event: "close"): void;
}

export interface V3Context {
  sessionManager: V3SessionManager;
}
