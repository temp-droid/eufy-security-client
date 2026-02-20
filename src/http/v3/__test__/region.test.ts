import { resolveV3Region } from "../region";

describe("resolveV3Region", () => {
  test("returns eu for security-app host without suffix", () => {
    expect(resolveV3Region("https://security-app.eufylife.com/")).toBe("eu");
  });

  test("returns parsed region for security-app host with suffix", () => {
    expect(resolveV3Region("https://security-app-us.eufylife.com/")).toBe("us");
  });

  test("returns parsed region for app-openapi host", () => {
    expect(resolveV3Region("https://app-openapi-eu-pr.eufy.com")).toBe("eu");
  });

  test("throws for unsupported host", () => {
    expect(() => resolveV3Region("https://example.com")).toThrow(
      "Unable to resolve V3 region from API base",
    );
  });
});
