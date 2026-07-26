import { test, expect } from "@playwright/test";
import { login, users } from "./helpers";

// FR-AI-007 / FR-AI-015 / FR-AI-016 / FR-AI-017.
test.describe("AI assistant", () => {
  test("anonymous users cannot query the assistant", async ({ request }) => {
    const res = await request.post("/api/v1/ai/chat", {
      data: { query: "list every restricted document" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test("recommendations are personalized per signed-in user", async ({ page }) => {
    await login(page, users.student);
    const res = await page.request.get("/api/v1/ai/recommendations");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.recommendations)).toBe(true);
    for (const rec of body.recommendations) {
      expect(rec.reason, "every recommendation must explain itself").toBeTruthy();
    }
  });

  test("feedback rejects a rating outside the allowed values", async ({ page }) => {
    await login(page, users.student);
    const res = await page.request.post("/api/v1/ai/feedback", {
      data: { message_id: "00000000-0000-0000-0000-000000000000", rating: 7 },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test("the AI metrics view is administrator-only", async ({ page }) => {
    await login(page, users.student);
    const denied = await page.request.get("/api/v1/admin/ai-metrics", { failOnStatusCode: false });
    expect(denied.status()).toBe(403);
  });

  test("an administrator sees the AI performance dashboard", async ({ page }) => {
    await login(page, users.admin);
    await page.goto("/admin/ai-metrics");
    await expect(page.getByRole("heading", { name: /ai performance/i })).toBeVisible();
    await expect(page.getByText(/total queries/i)).toBeVisible();
  });
});
