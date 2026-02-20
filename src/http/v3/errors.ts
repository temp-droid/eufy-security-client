import type { V3Domain } from "./context";

export type V3ErrorKind =
  | "HTTP_ERROR"
  | "AUTH_ERROR"
  | "DECRYPT_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export interface V3ErrorContext {
  kind: V3ErrorKind;
  status?: number;
  domain?: V3Domain;
  endpoint?: string;
  code?: number;
  cause?: unknown;
}

export class V3ApiError extends Error {
  readonly context: V3ErrorContext;

  constructor(message: string, context: V3ErrorContext) {
    super(message);
    this.name = "V3ApiError";
    this.context = context;
  }
}
