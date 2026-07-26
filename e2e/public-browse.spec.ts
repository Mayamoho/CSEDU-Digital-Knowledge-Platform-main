import { test, expect } from "@playwright/test";

// FR-TXX-010 / FR-TXX-019: anonymous visitors can browse public content.
test.describe("Public browsing", () => {
  for (const path of ["/", "/catalog", "/archive", "/research", "/projects"]) {
    test(`${path} renders for an anonymous visitor`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toBeEmpty();
    });
  }

  test("the catalog is searchable without signing in", async ({ page }) => {
    await page.goto("/catalog");
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill("algorithm");
    await search.press("Enter");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("restricted API routes reject anonymous callers", async ({ request }) => {
    const res = await request.get("/api/v1/media/my-uploads");
    expect(res.status()).toBe(401);
  });
});
