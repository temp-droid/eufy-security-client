import type { V3SessionManager } from "../session/V3SessionManager";
import { ResponseErrorCode } from "../../types";
import { getDeviceList } from "../endpoints/devices";
import { V3ApiError } from "../errors";
import { v3Request } from "../transport";

jest.mock("../transport", () => ({
  v3Request: jest.fn(),
}));

describe("getDeviceList", () => {
  const mockV3Request = jest.mocked(v3Request);

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns array when response.data.devices is present", async () => {
    const devices = [{ device_sn: "T123" }];
    mockV3Request.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        code: ResponseErrorCode.CODE_OK,
        msg: "ok",
        data: {
          devices,
        },
      },
    });

    const ctx = {
      sessionManager: {} as V3SessionManager,
    };

    await expect(getDeviceList(ctx)).resolves.toEqual(devices);
    expect(mockV3Request).toHaveBeenCalledTimes(1);
  });

  test("returns array when response.data is directly an array", async () => {
    const devices = [{ device_sn: "T123" }];
    mockV3Request.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        code: ResponseErrorCode.CODE_OK,
        msg: "ok",
        data: devices,
      },
    });

    const ctx = {
      sessionManager: {} as V3SessionManager,
    };

    await expect(getDeviceList(ctx)).resolves.toEqual(devices);
  });

  test("throws on non-OK result code", async () => {
    mockV3Request.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        code: 999,
        msg: "failed",
        data: {
          devices: [{ device_sn: "T123" }],
        },
      },
    });

    const ctx = {
      sessionManager: {} as V3SessionManager,
    };

    await expect(getDeviceList(ctx)).rejects.toBeInstanceOf(V3ApiError);
  });

  test("throws on non-200 HTTP status", async () => {
    mockV3Request.mockResolvedValue({
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      data: { code: 500, msg: "failed" },
    });

    const ctx = {
      sessionManager: {} as V3SessionManager,
    };

    await expect(getDeviceList(ctx)).rejects.toBeInstanceOf(V3ApiError);
  });

  test("throws when success payload shape is invalid", async () => {
    mockV3Request.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        code: ResponseErrorCode.CODE_OK,
        msg: "ok",
        data: {
          notDevices: true,
        },
      },
    });

    const ctx = {
      sessionManager: {} as V3SessionManager,
    };

    await expect(getDeviceList(ctx)).rejects.toBeInstanceOf(V3ApiError);
  });
});
