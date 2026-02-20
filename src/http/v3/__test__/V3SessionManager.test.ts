import type { ApiResponse } from "../../models";
import { V3SessionManager } from "../session/V3SessionManager";
import type { V3SessionDeps } from "../context";
import type { V3Session } from "../session/V3Session";

describe("V3SessionManager", () => {
  const deps: V3SessionDeps = {
    getToken: () => "token",
    getUserId: () => "user-id",
    getHeaders: () => ({}),
    invalidateToken: jest.fn(),
    emit: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("getSession returns cached instance for same domain", () => {
    const manager = new V3SessionManager("us", deps);

    const first = manager.getSession("house");
    const second = manager.getSession("house");

    expect(first).toBe(second);
  });

  test("request() delegates to session.request with default method and auth", async () => {
    const manager = new V3SessionManager("us", deps);
    const apiResponse: ApiResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { ok: true },
    };

    const sessionRequest = jest.fn().mockResolvedValue(apiResponse);
    const sessionMock = {
      request: sessionRequest,
    } as unknown as V3Session;

    jest.spyOn(manager, "getSession").mockReturnValue(sessionMock);

    const result = await manager.request({
      domain: "house",
      endpoint: "app/house/get_devs_list",
    });

    expect(manager.getSession).toHaveBeenCalledWith("house");
    expect(sessionRequest).toHaveBeenCalledWith(
      {
        method: "post",
        endpoint: "app/house/get_devs_list",
        data: undefined,
      },
      "required",
    );
    expect(result).toBe(apiResponse);
  });

  test("request() passes explicit auth to session", async () => {
    const manager = new V3SessionManager("us", deps);
    const apiResponse: ApiResponse = {
      status: 200,
      statusText: "OK",
      headers: {},
      data: { ok: true },
    };

    const sessionRequest = jest.fn().mockResolvedValue(apiResponse);
    const sessionMock = {
      request: sessionRequest,
    } as unknown as V3Session;

    jest.spyOn(manager, "getSession").mockReturnValue(sessionMock);

    await manager.request({
      domain: "passport",
      endpoint: "passport/profile",
      method: "get",
      auth: "optional",
    });

    expect(sessionRequest).toHaveBeenCalledWith(
      {
        method: "get",
        endpoint: "passport/profile",
        data: undefined,
      },
      "optional",
    );
  });

  test("invalidate() invalidates existing session only", () => {
    const manager = new V3SessionManager("us", deps);
    const houseSession = manager.getSession("house");
    const passportSession = manager.getSession("passport");

    const houseInvalidate = jest.spyOn(houseSession, "invalidate");
    const passportInvalidate = jest.spyOn(passportSession, "invalidate");

    manager.invalidate("house");

    expect(houseInvalidate).toHaveBeenCalledTimes(1);
    expect(passportInvalidate).not.toHaveBeenCalled();
  });
});
