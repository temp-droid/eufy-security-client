import type { V3Domain } from "./context";

export function getV3BaseUrl(domain: V3Domain, region: string): string {
  switch (domain) {
    case "security":
      return `https://security-app-${region}.eufylife.com`;
    case "mega":
      return `https://app-openapi-${region}-pr.eufy.com`;
    case "house":
      return `https://app-house-${region}-pr.eufy.com`;
    case "passport":
      return `https://app-passport-${region}-pr.eufy.com`;
  }
}
