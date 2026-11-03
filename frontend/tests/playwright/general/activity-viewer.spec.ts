import {
  loginPlaywrightAdmin,
  PLAYWRIGHT_ADMIN_PASSWORD,
} from "../playwright-auth.ts";
import { expect, test } from "../test-setup.ts";

test.describe("Activity Viewer API", () => {
  test("admin can list activity", async ({ page }) => {
    const response = await page.request.get(
      "http://127.0.0.1/api/tools/activity?from=0&to=9999999999",
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
  });

  test("admin can fetch activity stats", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 7 * 86400;
    const response = await page.request.get(
      `http://127.0.0.1/api/tools/activity/grouped?from=${from}&to=${now}&interval=hour&splitBy=eventType`,
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty("buckets");
    expect(Array.isArray(body.buckets)).toBe(true);
  });

  test("non-admin cannot query another user's activity via username param", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: undefined,
      baseURL: "http://127.0.0.1/",
    });
    const page = await context.newPage();

    await page.goto("/login");
    await loginPlaywrightAdmin(page);
    await page.waitForURL("**/files/**");

    const usersRes = await page.request.get("http://127.0.0.1/api/users");
    expect(usersRes.ok()).toBeTruthy();
    const users = (await usersRes.json()) as Array<{ id: number; username: string; permissions?: { admin?: boolean } }>;
    const adminUser = users.find((u) => u.permissions?.admin);
    if (!adminUser) {
      throw new Error("expected an admin user to exist");
    }

    const nonAdminName = `activity-test-${Date.now()}`;
    const createRes = await page.request.post("http://127.0.0.1/api/users", {
      headers: {
        "Content-Type": "application/json",
        "X-Password": PLAYWRIGHT_ADMIN_PASSWORD,
      },
      data: {
        which: [],
        data: {
          username: nonAdminName,
          password: "testpassword",
          permissions: {
            admin: false,
            share: true,
            api: false,
            realtime: false,
          },
          scopes: [
            {
              name: "playwright + files",
              scope: "/",
              permissions: {
                view: true,
                download: true,
                modify: true,
                create: true,
                delete: true,
              },
            },
          ],
        },
      },
    });
    expect(createRes.status()).toBe(201);

    await context.close();

    const userContext = await browser.newContext({
      storageState: undefined,
      baseURL: "http://127.0.0.1/",
    });
    const userPage = await userContext.newPage();
    await userPage.goto("/login");
    await userPage.getByPlaceholder("Username").fill(nonAdminName);
    await userPage.getByPlaceholder("Password").fill("testpassword");
    await userPage.getByRole("button", { name: "Login" }).click();
    await userPage.waitForURL("**/files/**");

    const now = Math.floor(Date.now() / 1000);
    const from = now - 86400;
    const scopedRes = await userPage.request.get(
      `http://127.0.0.1/api/tools/activity?from=${from}&to=${now}&username=${encodeURIComponent(adminUser.username)}`,
    );
    expect(scopedRes.status()).toBe(403);

    await userContext.close();
  });
});

test("activity viewer tool page loads", async ({ page, checkForErrors }) => {
  await page.goto("/tools/activityViewer");
  await expect(page.locator(".topTitle")).toContainText(/Activity Viewer/i);
  await checkForErrors();
});

test.describe("Recently opened files", () => {
  test("opening a file logs fileOpen and lists it in recent files", async ({ page }) => {
    const source = "playwright + files";
    const path = "/myfolder/testdata/gray-sample.jpg";
    const params = new URLSearchParams({ source, path });
    const opened = await page.request.get(`http://127.0.0.1/api/resources?${params}`);
    expect(opened.ok()).toBeTruthy();

    // Activity rows are flushed in batches, so wait for the entry to land.
    await expect
      .poll(
        async () => {
          const response = await page.request.get("http://127.0.0.1/api/activity/recent?limit=5");
          if (!response.ok()) {
            return null;
          }
          const files = await response.json();
          return files.find((f) => f.source === source && f.path === path) ?? null;
        },
        { timeout: 30000, intervals: [1000] },
      )
      .toMatchObject({ name: "gray-sample.jpg", type: "image/jpeg" });

    const activity = await page.request.get(
      "http://127.0.0.1/api/tools/activity?from=0&to=9999999999&eventType=fileOpen",
    );
    expect(activity.ok()).toBeTruthy();
    const body = await activity.json();
    expect(body.items.some((item) => item.path === path)).toBe(true);
  });
});
