import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { HTTPApi } from "../http";
import { createV3Api } from "../http/v3-api";
import { generateSerialnumber, generateUDID, md5 } from "../utils";
import { libVersion } from "..";
import type { HTTPApiPersistentData } from "../http/interfaces";

interface SessionData {
  country: string;
  login_hash: string;
  openudid: string;
  serial_number: string;
  cloud_token?: string;
  cloud_token_expiration?: number;
  push_persistentIds: string[];
  version: string;
  httpApi?: HTTPApiPersistentData;
}

const SESSION_FILE = path.resolve(process.cwd(), "session.json");

function summarizeDevice(device: unknown): unknown {
  if (!device || typeof device !== "object") {
    return device;
  }

  const data = device as Record<string, unknown>;
  const pick = (key: string): unknown => data[key];

  return {
    device_sn: pick("device_sn"),
    name: pick("device_name") ?? pick("name") ?? pick("nick_name"),
    model: pick("device_model") ?? pick("model"),
    station_sn: pick("station_sn"),
    type: pick("device_type") ?? pick("type"),
    category: pick("category"),
    online: pick("online"),
    enabled: pick("enabled"),
  };
}

function formatOneDeviceOutput(devices: unknown): { count: number; firstDevice: unknown | null } {
  if (!Array.isArray(devices)) {
    return { count: 0, firstDevice: null };
  }

  return {
    count: devices.length,
    firstDevice: devices.length > 0 ? summarizeDevice(devices[0]) : null,
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  return value ? value.trim() : "";
}

function printMissingEnvError(missing: string[]): void {
  console.error("Missing required environment variables:");
  missing.forEach((key) => console.error(`- ${key}`));
  console.error("");
  console.error("Copy/paste example:");
  console.error(
    "EUFY_COUNTRY=US EUFY_USERNAME=you@example.com EUFY_PASSWORD='your-password' npm run demo:v3",
  );
}

function loadSession(): SessionData | undefined {
  if (!existsSync(SESSION_FILE)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as SessionData;
    return parsed;
  } catch {
    return undefined;
  }
}

function isHttpApiSessionDataComplete(session: SessionData | undefined): boolean {
  const data = session?.httpApi;
  return !!(data && data.clientPrivateKey && data.serverPublicKey);
}

async function run(): Promise<void> {
  const country = getRequiredEnv("EUFY_COUNTRY").toUpperCase();
  const username = getRequiredEnv("EUFY_USERNAME");
  const password = getRequiredEnv("EUFY_PASSWORD");

  const missing = [
    ["EUFY_COUNTRY", country],
    ["EUFY_USERNAME", username],
    ["EUFY_PASSWORD", password],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    printMissingEnvError(missing);
    process.exitCode = 1;
    return;
  }

  const loginHash = md5(`${username}:${password}`);
  const loadedSession = loadSession();
  const previousCountry = loadedSession?.country;
  const previousLoginHash = loadedSession?.login_hash;

  let session: SessionData = {
    country,
    login_hash: loginHash,
    openudid: loadedSession?.openudid || generateUDID(),
    serial_number: loadedSession?.serial_number || generateSerialnumber(12),
    cloud_token: loadedSession?.cloud_token,
    cloud_token_expiration: loadedSession?.cloud_token_expiration,
    push_persistentIds: loadedSession?.push_persistentIds || [],
    version: loadedSession?.version || libVersion,
    httpApi: loadedSession?.httpApi,
  };

  if (
    previousCountry !== undefined &&
    previousLoginHash !== undefined &&
    (previousCountry !== country || previousLoginHash !== loginHash)
  ) {
    session.cloud_token = "";
    session.cloud_token_expiration = 0;
    session.httpApi = undefined;
  }

  if (!isHttpApiSessionDataComplete(session)) {
    session.cloud_token = "";
    session.cloud_token_expiration = 0;
    session.httpApi = undefined;
  }

  let api: HTTPApi | undefined;

  try {
    api = await HTTPApi.initialize(country, username, password, session.httpApi);
    api.setOpenUDID(session.openudid);
    api.setSerialNumber(session.serial_number);

    if (session.cloud_token && session.cloud_token_expiration) {
      api.setToken(session.cloud_token);
      api.setTokenExpiration(new Date(session.cloud_token_expiration));
    }

    await api.login({ force: false });

    const v3 = createV3Api(api);
    const devices = await v3.getDeviceList();

    if (process.env.DEBUG_V3 === "1") {
      const persistentData = api.getPersistentData();
      console.log("Debug auth/session state:");
      console.log(
        JSON.stringify(
          {
            hasToken: !!api.getToken(),
            tokenExpiration: api.getTokenExpiration()?.toISOString(),
            reusedTokenFromSession: api.getToken() === session.cloud_token,
            userId: persistentData?.user_id,
            countryHeader: api.getV3Headers().country,
            openudidHeader: api.getV3Headers().openudid,
            serialHeader: api.getV3Headers().sn,
            apiBase: api.getAPIBase(),
          },
          null,
          2,
        ),
      );
    }

    if (!Array.isArray(devices)) {
      throw new Error("V3 API returned an unexpected device payload shape");
    }

    console.log("V3 device list response:");
    console.log(JSON.stringify(formatOneDeviceOutput(devices), null, 2));

    const token = api.getToken();
    const tokenExpiration = api.getTokenExpiration();

    session = {
      ...session,
      country,
      login_hash: loginHash,
      cloud_token: token || "",
      cloud_token_expiration: tokenExpiration ? tokenExpiration.getTime() : 0,
      httpApi: api.getPersistentData(),
      version: libVersion,
    };

    writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
  } finally {
    api?.close();
  }
}

run().catch((err) => {
  console.error("V3 demo script failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
