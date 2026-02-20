import type { DeviceListResponse, ResultResponse } from "../../models";
import type { V3Context } from "../context";
import { ResponseErrorCode } from "../../types";
import { V3ApiError } from "../errors";
import { v3Request } from "../transport";

export async function getDeviceList(
  ctx: V3Context,
): Promise<Array<DeviceListResponse>> {
  const response = await v3Request(ctx, {
    method: "post",
    domain: "house",
    endpoint: "app/house/get_devs_list",
    data: {},
  });

  if (response.status == 200) {
    const result: ResultResponse = response.data;
    if (result.code == ResponseErrorCode.CODE_OK) {
      if (!result.data) {
        throw new V3ApiError("Device list V3 - Response payload is empty", {
          kind: "HTTP_ERROR",
          domain: "house",
          endpoint: "app/house/get_devs_list",
        });
      }

      const deviceList = (result.data.devices ?? result.data) as Array<DeviceListResponse>;
      if (!Array.isArray(deviceList)) {
        throw new V3ApiError("Device list V3 - Response payload shape is invalid", {
          kind: "HTTP_ERROR",
          domain: "house",
          endpoint: "app/house/get_devs_list",
        });
      }

      return deviceList;
    } else {
      throw new V3ApiError("Device list V3 - Response code not ok", {
        kind: "HTTP_ERROR",
        code: result.code,
        domain: "house",
        endpoint: "app/house/get_devs_list",
      });
    }
  } else {
    throw new V3ApiError("Device list V3 - Status return code not 200", {
      kind: "HTTP_ERROR",
      status: response.status,
      domain: "house",
      endpoint: "app/house/get_devs_list",
      cause: {
        statusText: response.statusText,
        data: response.data,
      },
    });
  }
}
