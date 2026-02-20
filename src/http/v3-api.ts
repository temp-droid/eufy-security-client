import type { HTTPApi } from "./api";
import { getDeviceList } from "./v3/endpoints";
import { V3SessionManager } from "./v3/session/V3SessionManager";
import type { V3SessionDeps } from "./v3/context";
import { resolveV3Region } from "./v3/region";

function getHeaderSnapshot(api: HTTPApi): Record<string, string | undefined> {
  return api.getV3Headers();
}

export class V3Api {
  private readonly sessionManager: V3SessionManager;
  private readonly region: string;

  constructor(private readonly api: HTTPApi) {
    const deps: V3SessionDeps = {
      getToken: () => this.api.getToken(),
      getUserId: () => this.api.getPersistentData()?.user_id,
      getHeaders: () => getHeaderSnapshot(this.api),
      invalidateToken: () => this.api.invalidateAuthToken(),
      ensureLogin: async () => {
        await this.api.login({ force: true });
        if (!this.api.getToken()) {
          await this.api.loginV3Passport();
        }
      },
      emit: (event) => this.api.emitV3Event(event),
    };

    this.region = resolveV3Region(this.api.getAPIBase());
    this.sessionManager = new V3SessionManager(this.region, deps);
  }

  async getDeviceList() {
    return getDeviceList({
      sessionManager: this.sessionManager,
    });
  }
}

export function createV3Api(api: HTTPApi): V3Api {
  return new V3Api(api);
}
