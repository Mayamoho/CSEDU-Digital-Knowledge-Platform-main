import { test, expect } from "@playwright/test";
import { login, users } from "./helpers";

test.describe("Authentication", () => {
  test("a member can sign in and reach the dashboard", async ({ page }) => {
    await login(page, users.student);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("bad credentials are rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(users.student.email);
    await page.getByLabel(/password/i).first().fill("definitely-not-the-password");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  // The security change this suite exists to protect: the session must live in
  // an HttpOnly cookie, not in storage that page script can read.
  test("the session token is not readable by page script", async ({ page, context }) => {
    await login(page, users.student);

    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /token/i.test(k)),
    );
    expect(stored).not.toContain("csedu_access_token");
    expect(stored).not.toContain("csedu_refresh_token");

    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === "csedu_access");
    expect(access, "csedu_access session cookie should be set").toBeTruthy();
    expect(access!.httpOnly).toBe(true);
  });

  test("the session survives a full page reload", async ({ page }) => {
    await login(page, users.student);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
