export function resolveV3Region(apiBase: string): string {
  const hostname = new URL(apiBase).hostname;

  const appRegionMatch = hostname.match(/^security-app(?:-(\w+))?\.eufylife\.com$/);
  if (appRegionMatch) {
    return appRegionMatch[1] ?? "eu";
  }

  const openApiRegionMatch = hostname.match(/^app-(?:openapi|house|passport)-(\w+)-pr\.eufy\.com$/);
  if (openApiRegionMatch?.[1]) {
    return openApiRegionMatch[1];
  }

  const fallbackRegionMatch = hostname.match(/-(\w+)-pr\.eufy\.com$/);
  if (fallbackRegionMatch?.[1]) {
    return fallbackRegionMatch[1];
  }

  if (hostname.endsWith(".eufylife.com")) {
    const genericMatch = hostname.match(/-(\w+)\.eufylife\.com$/);
    if (genericMatch?.[1]) {
      return genericMatch[1];
    }
  }

  if (hostname === "localhost") {
    return "eu";
  }

  throw new Error(`Unable to resolve V3 region from API base: ${apiBase}`);
}
