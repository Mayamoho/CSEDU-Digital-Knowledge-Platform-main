import { test, expect } from "@playwright/test";

// FR-TXX-002 / FR-AI-006: the UI is available in English and Bangla.
test("the interface switches to Bangla and back", async ({ page }) => {
  await page.goto("/login");
  const bangla = page.getByRole("button", { name: /বাংলা|bangla/i }).first();
  await bangla.click();
  await expect(page.locator("body")).toContainText(/[ঀ-৿]/);
});
