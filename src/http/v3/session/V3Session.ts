import { createECDH, createHmac, randomUUID } from "crypto";

import { V3CryptoHeaders, aesEncryptCBC, aesDecryptCBC } from "../../crypto";
import type { EcdhKeyExchangeResult } from "../../crypto";
import type { ApiResponse, ResultResponse } from "../../models";
import type { HTTPApiRequest } from "../../interfaces";
import type { V3Auth, V3Domain, V3SessionDeps } from "../context";
import { ensureError } from "../../../error";
import { getError, md5, parseJSON } from "../../../utils";
import { rootHTTPLogger } from "../../../logging";
import { getV3BaseUrl } from "../domains";
import { V3ApiError } from "../errors";

export class V3Session {
  private crypto: V3CryptoHeaders | null = null;
  private sessionPromise: Promise<void> | null = null;

  constructor(
    private readonly label: string,
    private readonly presetKey: string,
    private readonly domain: V3Domain,
    private readonly region: string,
    private readonly deps: V3SessionDeps,
    private readonly keyExchangeDomain?: V3Domain
  ) {}

  static getBaseUrl(domain: V3Domain, region: string): string {
    return getV3BaseUrl(domain, region);
  }

  static buildIdentityHeaders(headers: Record<string, string | undefined>): Record<string, string> {
    const osType = headers.os_type ?? headers.Os_type ?? "android";
    const osVersion = headers.os_version ?? headers.Os_version ?? "29";
    const phoneModel = headers.phone_model ?? headers.Phone_model ?? "ONEPLUS A3003";
    const appVersion = headers.app_version ?? headers.App_version ?? "5.7.00_18966";
    const country = headers.country ?? headers.Country ?? "US";
    const language = headers.language ?? headers.Language ?? "en";
    const openudid = headers.openudid ?? headers.Openudid ?? "5e4621b0152c0d00";
    const modelType = headers.model_type ?? headers.Model_type ?? "PHONE";

    return {
      "User-Agent": "ktor-client",
      "os-type": osType,
      os_type: osType,
      "os-version": osVersion,
      os_version: osVersion,
      "phone-model": phoneModel,
      phone_model: phoneModel,
      "app-version": appVersion,
      app_version: appVersion,
      country: country,
      language: language,
      openudid: openudid,
      "Model-type": modelType,
      "Test-Flag": "false",
      Accept: "application/json",
      "Accept-Charset": "UTF-8",
    };
  }

  static async performKeyExchange(options: {
    presetKey: string;
    url: string;
    identityHeaders: Record<string, string>;
    token: string | null;
    userId: string | undefined;
    onUnauthorized?: () => void;
  }): Promise<EcdhKeyExchangeResult> {
    const { presetKey, url, identityHeaders, token, userId, onUnauthorized } = options;

    const v3Ecdh = createECDH("prime256v1");
    v3Ecdh.generateKeys();
    const clientPublicKeyHex = v3Ecdh.getPublicKey("hex");

    const encryptedKey = aesEncryptCBC(presetKey, clientPublicKeyHex);

    const ts = Math.floor(Date.now() / 1000).toString();
    const once = randomUUID().replace(/-/g, "");
    const message = `${ts}+${once}+${encryptedKey}`;
    const signature = createHmac("sha256", presetKey).update(message, "utf8").digest("hex");

    const xKeyIdent = randomUUID().replace(/-/g, "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Request-Ts": ts,
          "X-Request-Once": once,
          "X-Key-Ident": xKeyIdent,
          "X-Signature": signature,
          "X-Encryption-Info": "algo_ecdh",
          "X-Replay-Info": "replay",
          ...identityHeaders,
          "app-name": "eufy_mega",
          "Content-Type": "application/json",
          gtoken: userId ? md5(userId) : "",
          "X-Auth-Token": token ?? "",
        },
        body: JSON.stringify({ client_public_key: encryptedKey }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        onUnauthorized?.();
        throw new V3ApiError("V3 key exchange failed: unauthorized", {
          kind: "AUTH_ERROR",
          status: response.status,
        });
      }

      if (response.status !== 200) {
        const errorBody = await response.text();
        throw new V3ApiError(`V3 key exchange failed: HTTP ${response.status}: ${errorBody}`, {
          kind: "HTTP_ERROR",
          status: response.status,
        });
      }

      const result = (await response.json()) as {
        code: number;
        msg: string;
        data?: { server_public_key?: string };
      };

      if (result.code !== 0) {
        throw new V3ApiError(`V3 key exchange error code ${result.code}: ${result.msg}`, {
          kind: "HTTP_ERROR",
          code: result.code,
        });
      }

      const serverPublicKeyEncrypted = result.data?.server_public_key;
      if (!serverPublicKeyEncrypted) {
        throw new V3ApiError("V3 key exchange: missing server_public_key in response", {
          kind: "HTTP_ERROR",
        });
      }

      const serverKeyHex = aesDecryptCBC(presetKey, serverPublicKeyEncrypted);
      const sharedSecret = v3Ecdh.computeSecret(Buffer.from(serverKeyHex, "hex"));
      const signingKey = sharedSecret.subarray(0, 16).toString("hex");

      return { signingKey, xKeyIdent };
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureSession(auth: V3Auth = "required"): Promise<void> {
    if (this.crypto) return;

    const token = await this.ensureAuthToken(auth, "session");

    if (this.sessionPromise) {
      await this.sessionPromise;
      return;
    }

    const exchangeDomain = this.keyExchangeDomain ?? this.domain;
    const url = `${V3Session.getBaseUrl(exchangeDomain, this.region)}/${this.getKeyExchangeEndpoint()}`;
    const identityHeaders = V3Session.buildIdentityHeaders(this.deps.getHeaders());

    this.sessionPromise = V3Session.performKeyExchange({
      presetKey: this.presetKey,
      url,
      identityHeaders,
      token: auth === "none" ? null : token,
      userId: this.deps.getUserId(),
      onUnauthorized: () => {
        this.deps.invalidateToken();
        this.deps.emit("close");
      },
    }).then((result) => {
      this.crypto = new V3CryptoHeaders(result.signingKey, result.xKeyIdent);
    });

    try {
      await this.sessionPromise;
    } catch (err) {
      const error = ensureError(err);
      rootHTTPLogger.error(`${this.label} session establishment failed`, {
        error: getError(error),
      });
      throw error;
    } finally {
      this.sessionPromise = null;
    }
  }

  async request(request: HTTPApiRequest, auth: V3Auth = "required", isRetry = false): Promise<ApiResponse> {
    const endpoint = typeof request.endpoint === "string" ? request.endpoint : request.endpoint.toString();

    await this.ensureSession(auth);

    const token = await this.ensureAuthToken(auth, "request", endpoint);

    const plainBody = request.data ? JSON.stringify(request.data) : undefined;
    const { headers: v3Headers, encryptedBody } = this.crypto!.buildHeaders(plainBody);

    const baseUrl = V3Session.getBaseUrl(this.domain, this.region);
    const url = `${baseUrl}/${endpoint}`;
    const depHeaders = this.deps.getHeaders();
    const modelType = depHeaders.model_type ?? depHeaders.Model_type ?? "PHONE";
    const serialNumber = depHeaders.sn ?? depHeaders.Sn ?? "unknown";
    const timezone = depHeaders.timezone ?? depHeaders.Timezone ?? "GMT+01:00";
    const netType = depHeaders.net_type ?? depHeaders.Net_type ?? "wifi";
    const mcc = depHeaders.mcc ?? depHeaders.Mcc ?? "null";
    const mnc = depHeaders.mnc ?? depHeaders.Mnc ?? "null";
    const abCode = depHeaders.country ?? depHeaders.Country ?? "US";

    const headers: Record<string, string> = {
      ...v3Headers,
      ...V3Session.buildIdentityHeaders(depHeaders),
      "app-name": "eufy_mega",
      Category: "eufy_security",
      "app-tab": "eufy_security",
      Model_type: modelType,
      sn: serialNumber,
      timezone: timezone,
      net_type: netType,
      "Cache-Control": "no-cache",
      mcc: mcc,
      mnc: mnc,
      ab_code: abCode,
      gtoken: this.deps.getUserId() ? md5(this.deps.getUserId()!) : "",
      "X-Auth-Token": token ?? "",
      Authorization: token ?? "",
      "Content-Type": "application/json",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const internalResponse = await fetch(url, {
        method: (request.method?.toUpperCase() ?? "POST") as string,
        headers,
        body: encryptedBody,
        signal: controller.signal,
      });

      if (internalResponse.status === 401) {
        const oldToken = token;
        this.deps.invalidateToken();
        if (!isRetry && this.deps.ensureLogin) {
          await this.deps.ensureLogin();
          const refreshedToken = this.deps.getToken();
          if (refreshedToken && refreshedToken !== oldToken) {
            return this.request(request, auth, true);
          }
        }

        this.deps.emit("close");
        throw new V3ApiError(`${this.label} request failed: HTTP 401`, {
          kind: "AUTH_ERROR",
          status: internalResponse.status,
          domain: this.domain,
          endpoint,
        });
      }

      if (internalResponse.status !== 200) {
        const errorBody = await internalResponse.text();
        throw new V3ApiError(`${this.label} request failed: HTTP ${internalResponse.status}: ${errorBody}`, {
          kind: "HTTP_ERROR",
          status: internalResponse.status,
          domain: this.domain,
          endpoint,
        });
      }

      const result = (await internalResponse.json()) as ResultResponse;
      if (result.data && typeof result.data === "string") {
        try {
          const parsed = parseJSON(this.crypto!.decryptBody(result.data), rootHTTPLogger);
          if (parsed === undefined) {
            throw new V3ApiError("V3 decrypt produced invalid JSON payload", {
              kind: "DECRYPT_ERROR",
              domain: this.domain,
              endpoint,
            });
          }
          result.data = parsed;
        } catch (err) {
          const error = ensureError(err);
          if (error instanceof V3ApiError) {
            throw error;
          }
          throw new V3ApiError("V3 decrypt failed", {
            kind: "DECRYPT_ERROR",
            domain: this.domain,
            endpoint,
            cause: error,
          });
        }
      }

      const responseHeaders: Record<string, string> = {};
      internalResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: internalResponse.status,
        statusText: internalResponse.statusText ?? "",
        headers: responseHeaders,
        data: result,
      };
    } catch (err) {
      const error = ensureError(err);
      if (error instanceof V3ApiError) {
        throw error;
      }

      rootHTTPLogger.error(`${this.label} request error`, {
        error: getError(error),
        endpoint,
      });

      throw new V3ApiError(`${this.label} API request error`, {
        kind: "NETWORK_ERROR",
        domain: this.domain,
        endpoint,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  invalidate(): void {
    this.crypto = null;
    this.sessionPromise = null;
  }

  hasCrypto(): boolean {
    return this.crypto !== null;
  }

  private async ensureAuthToken(auth: V3Auth, stage: "session" | "request", endpoint?: string): Promise<string | null> {
    if (auth !== "required") {
      return this.deps.getToken();
    }

    let token = this.deps.getToken();
    if (token) {
      return token;
    }

    if (this.deps.ensureLogin) {
      await this.deps.ensureLogin();
      token = this.deps.getToken();
    }

    if (!token) {
      throw new V3ApiError(`${this.label} ${stage} requires authentication token after login`, {
        kind: "AUTH_ERROR",
        domain: this.domain,
        endpoint,
      });
    }

    return token;
  }

  private getKeyExchangeEndpoint(): string {
    if (this.domain === "security") {
      return "v3/openapi/oauth/key/exchange";
    }
    return "openapi/oauth/key/exchange";
  }
}
