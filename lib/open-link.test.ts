import { describe, expect, it } from "vitest";
import { nimiqPayOpenUrl } from "./open-link";

describe("nimiqPayOpenUrl", () => {
  it("keeps the host and path for an https page", () => {
    expect(nimiqPayOpenUrl("https://circles.181labs.build/pay/grp_1/shr_2")).toBe(
      "https://nimpay.app/miniapps/open/circles.181labs.build/pay/grp_1/shr_2",
    );
    expect(nimiqPayOpenUrl("https://circles.181labs.build/")).toBe("https://nimpay.app/miniapps/open/circles.181labs.build");
    expect(nimiqPayOpenUrl("https://circles.181labs.build/join/ABCDEFGH?x=1")).toBe(
      "https://nimpay.app/miniapps/open/circles.181labs.build/join/ABCDEFGH?x=1",
    );
  });

  it("refuses http so local testing stays on Custom URL", () => {
    expect(nimiqPayOpenUrl("http://192.168.1.20:3020/join/ABCDEFGH")).toBeNull();
    expect(nimiqPayOpenUrl("not a url")).toBeNull();
  });
});
