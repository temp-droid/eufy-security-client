import { V3Session } from "../session/V3Session";
import type { V3SessionDeps } from "../context";
import { V3ApiError } from "../errors";
import { V3CryptoHeaders } from "../../crypto";

function createFetchResponse(options: {
  status: number;
  statusText?: string;
  jsonBody?: unknown;
  textBody?: string;
}) {
  const headers = {
    forEach: (callback: (value: string, key: string) => void) => {
      callback("application/json", "content-type");
    },
  };

  return {
    status: options.status,
    statusText: options.statusText ?? "",
    headers,
    async json() {
      return options.jsonBody;
    },
    async text() {
      return options.textBody ?? "";
    },
  };
}

describe("V3Session auth behavior", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("ensureSession attempts login when token is missing", async () => {
    let token: string | null = null;
    const ensureLogin = jest.fn(async () => {
      token = "token-from-login";
    });

    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(),
      emit: jest.fn(),
      ensureLogin,
    };

    jest.spyOn(V3Session, "performKeyExchange").mockResolvedValue({
      signingKey: "0123456789abcdeffedcba9876543210",
      xKeyIdent: "key-ident",
    });

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(session.ensureSession("required")).resolves.toBeUndefined();
    expect(ensureLogin).toHaveBeenCalledTimes(1);
  });

  test("request retries once after 401 when login refreshes token", async () => {
    let token: string | null = "old-token";
    const ensureLogin = jest.fn(async () => {
      token = "new-token";
    });

    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(() => {
        token = null;
      }),
      emit: jest.fn(),
      ensureLogin,
    };

    jest.spyOn(V3Session, "performKeyExchange").mockResolvedValue({
      signingKey: "0123456789abcdeffedcba9876543210",
      xKeyIdent: "key-ident",
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: 401, statusText: "Unauthorized", textBody: "unauthorized" }))
      .mockResolvedValueOnce(
        createFetchResponse({
          status: 200,
          statusText: "OK",
          jsonBody: { code: 0, msg: "success", data: { devices: [] } },
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(
      session.request({ method: "post", endpoint: "app/house/get_devs_list", data: {} }),
    ).resolves.toMatchObject({ status: 200 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureLogin).toHaveBeenCalledTimes(1);
  });

  test("throws AUTH_ERROR when login does not produce token", async () => {
    let token: string | null = null;
    const ensureLogin = jest.fn(async () => undefined);

    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(),
      emit: jest.fn(),
      ensureLogin,
    };

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(session.ensureSession("required")).rejects.toMatchObject({
      name: "V3ApiError",
      context: { kind: "AUTH_ERROR" },
    });
    expect(ensureLogin).toHaveBeenCalledTimes(1);
  });

  test("does not retry 401 when refreshed token is unchanged", async () => {
    let token: string | null = "old-token";
    const ensureLogin = jest.fn(async () => {
      token = "old-token";
    });

    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(() => {
        token = null;
      }),
      emit: jest.fn(),
      ensureLogin,
    };

    jest.spyOn(V3Session, "performKeyExchange").mockResolvedValue({
      signingKey: "0123456789abcdeffedcba9876543210",
      xKeyIdent: "key-ident",
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: 401, statusText: "Unauthorized", textBody: "unauthorized" }));
    global.fetch = fetchMock as typeof fetch;

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(
      session.request({ method: "post", endpoint: "app/house/get_devs_list", data: {} }),
    ).rejects.toBeInstanceOf(V3ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ensureLogin).toHaveBeenCalledTimes(1);
  });

  test("retries only once on repeated 401 responses", async () => {
    let token: string | null = "old-token";
    const ensureLogin = jest.fn(async () => {
      token = "new-token";
    });

    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(() => {
        token = null;
      }),
      emit: jest.fn(),
      ensureLogin,
    };

    jest.spyOn(V3Session, "performKeyExchange").mockResolvedValue({
      signingKey: "0123456789abcdeffedcba9876543210",
      xKeyIdent: "key-ident",
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: 401, statusText: "Unauthorized", textBody: "unauthorized" }))
      .mockResolvedValueOnce(createFetchResponse({ status: 401, statusText: "Unauthorized", textBody: "unauthorized" }));
    global.fetch = fetchMock as typeof fetch;

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(
      session.request({ method: "post", endpoint: "app/house/get_devs_list", data: {} }),
    ).rejects.toBeInstanceOf(V3ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureLogin).toHaveBeenCalledTimes(1);
  });

  test("throws DECRYPT_ERROR when decrypted payload is invalid JSON", async () => {
    let token: string | null = "token";
    const deps: V3SessionDeps = {
      getToken: () => token,
      getUserId: () => "user-id",
      getHeaders: () => ({ country: "BE", language: "en", openudid: "udid", sn: "sn" }),
      invalidateToken: jest.fn(),
      emit: jest.fn(),
      ensureLogin: jest.fn(),
    };

    jest.spyOn(V3Session, "performKeyExchange").mockResolvedValue({
      signingKey: "0123456789abcdeffedcba9876543210",
      xKeyIdent: "key-ident",
    });

    jest.spyOn(V3CryptoHeaders.prototype, "decryptBody").mockReturnValue("not-json");

    const fetchMock = jest.fn().mockResolvedValueOnce(
      createFetchResponse({
        status: 200,
        statusText: "OK",
        jsonBody: { code: 0, msg: "success", data: "encrypted-payload" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const session = new V3Session("Mega", "2500a7d5617812f9d52515b2c8f20a3d", "house", "eu", deps, "mega");

    await expect(
      session.request({ method: "post", endpoint: "app/house/get_devs_list", data: {} }),
    ).rejects.toMatchObject({
      name: "V3ApiError",
      context: { kind: "DECRYPT_ERROR" },
    });
  });
});
