import { createECDH } from "crypto";

import { PRESET_KEYS, V3CryptoHeaders } from "../../crypto";
import type { LoginRequest, LoginResultResponse, ResultResponse } from "../../models";
import { ResponseErrorCode } from "../../types";
import { encryptAPIData } from "../../utils";
import { parseJSON } from "../../../utils";
import { rootHTTPLogger } from "../../../logging";
import { V3Session } from "../session/V3Session";
import { resolveV3Region } from "../region";

export interface V3PassportLoginParams {
  apiBase: string;
  headers: Record<string, string | undefined>;
  token: string | null;
  userId?: string;
  username: string;
  password: string;
  clientPrivateKey: string;
  serverPublicKey: string;
  onUnauthorized?: () => void;
}

export interface V3PassportLoginResult {
  loginData: LoginResultResponse;
}

export async function loginV3Passport(
  params: V3PassportLoginParams,
): Promise<V3PassportLoginResult> {
  const region = resolveV3Region(params.apiBase);

  const v3Ecdh = createECDH("prime256v1");
  v3Ecdh.setPrivateKey(Buffer.from(params.clientPrivateKey, "hex"));

  const megaResult = await V3Session.performKeyExchange({
    presetKey: PRESET_KEYS.MEGA_PR,
    url: `${V3Session.getBaseUrl("mega", region)}/openapi/oauth/key/exchange`,
    identityHeaders: V3Session.buildIdentityHeaders(params.headers),
    token: params.token,
    userId: params.userId,
    onUnauthorized: params.onUnauthorized,
  });

  const v3Crypto = new V3CryptoHeaders(megaResult.signingKey, megaResult.xKeyIdent);

  const timezoneOffset = new Date().getTimezoneOffset();
  const data: LoginRequest = {
    ab: params.headers.country ?? "US",
    client_secret_info: {
      public_key: v3Ecdh.getPublicKey("hex"),
    },
    enc: 0,
    email: params.username,
    password: encryptAPIData(
      params.password,
      v3Ecdh.computeSecret(Buffer.from(params.serverPublicKey, "hex")),
    ),
    time_zone: timezoneOffset !== 0 ? -timezoneOffset * 60 * 1000 : 0,
    transaction: `${new Date().getTime()}`,
  };

  const plainBody = JSON.stringify(data);
  const { headers: v3Headers, encryptedBody } = v3Crypto.buildHeaders(plainBody);

  const loginUrl = `${V3Session.getBaseUrl("passport", region)}/passport/login`;
  const loginHeaders: Record<string, string> = {
    ...v3Headers,
    ...V3Session.buildIdentityHeaders(params.headers),
    "app-name": "eufy_mega",
    "Content-Type": "application/json",
    "X-Auth-Token": "",
    "gtoken": "",
  };

  const response = await fetch(loginUrl, {
    method: "POST",
    headers: loginHeaders,
    body: encryptedBody,
  });

  if (response.status !== 200) {
    const errorBody = await response.text();
    throw new Error(`V3 passport login failed: HTTP ${response.status}: ${errorBody}`);
  }

  const result = (await response.json()) as ResultResponse;
  if (result.data && typeof result.data === "string") {
    result.data = parseJSON(v3Crypto.decryptBody(result.data), rootHTTPLogger);
  }

  if (result.code !== ResponseErrorCode.CODE_OK || !result.data) {
    throw new Error(`V3 passport login failed: code ${result.code} (${result.msg})`);
  }

  return {
    loginData: result.data as LoginResultResponse,
  };
}
