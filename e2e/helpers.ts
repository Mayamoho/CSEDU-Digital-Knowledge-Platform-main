import { Page, expect } from "@playwright/test";

// Seeded evaluation accounts from infra/db/init.sql. Overridable so the suite
// can be pointed at a deployment whose demo passwords have been rotated.
export const users = {
  student: {
    email: process.env.E2E_STUDENT_EMAIL || "student@cs.du.ac.bd",
    password: process.env.E2E_STUDENT_PASSWORD || "Student@12345",
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || "admin@cs.du.ac.bd",
    password: process.env.E2E_ADMIN_PASSWORD || "Admin@12345",
  },
};

export async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).first().fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}
