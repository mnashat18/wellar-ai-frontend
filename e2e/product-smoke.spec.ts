import { test, expect, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD for authenticated E2E runs.');

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/app\//, { timeout: 30_000 });
  // Post-login may intentionally pause on the welcome/activation transition.
  const enterWorkspace = page.getByRole('button', { name: /enter workspace/i });
  if (await enterWorkspace.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await enterWorkspace.click();
  }
  await page.goto('/app/dashboard');
  await expect(page.locator('#app-sidebar-navigation')).toBeVisible({ timeout: 30_000 });
}

async function assertHealthy(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#app-sidebar-navigation')).toBeVisible();
}

test('authenticated routes load without fatal UI errors', async ({ page }) => {
  const errors: string[] = [];
  const failedApi: Array<{ method: string; path: string; status: number }> = [];
  const failedTransport: Array<{ method: string; path: string; failure: string }> = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'dash.conntinuity.com' && response.status() >= 400) {
      failedApi.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'dash.conntinuity.com') {
      failedTransport.push({ method: request.method(), path: url.pathname, failure: request.failure()?.errorText ?? 'unknown' });
    }
  });
  await login(page);
  for (const route of ['/app/dashboard', '/app/workforce', '/app/scan-requests', '/app/compliance', '/app/alerts', '/app/reports', '/app/company', '/app/activity', '/app/settings', '/app/workspace-access']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await assertHealthy(page);
    if (route === '/app/compliance') {
      const complianceFailures = failedApi.filter((item) => item.status >= 400);
      const warningVisible = await page.getByText('Some compliance sources are unavailable due to workspace permissions.', { exact: true }).isVisible().catch(() => false);
      console.log('[Compliance E2E]', JSON.stringify({ warningVisible, failures: complianceFailures }));
      if (failedTransport.length) console.log('[Compliance transport failures]', JSON.stringify(failedTransport));
    }
    await expect(page.locator('#app-sidebar-navigation')).toBeVisible();
  }
  expect(errors).toEqual([]);
  // Keep permission-degraded states visible; fail only on authentication/server failures.
  expect(failedApi.filter((item) => item.status === 401 || item.status >= 500)).toEqual([]);
});

test('desktop sidebar remains anchored while the document scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto('/app/dashboard');
  const sidebar = page.locator('app-dashboard-sidebar.app-sidebar');
  const panel = page.locator('.app-sidebar__panel');
  const nav = page.locator('.app-sidebar__nav');
  const footer = page.locator('.app-sidebar__footer');
  const before = await sidebar.boundingBox();
  const beforeParts = await Promise.all([panel.boundingBox(), nav.boundingBox(), footer.boundingBox()]);
  const main = page.locator('.app-main');
  await main.evaluate((el) => { (el as HTMLElement).scrollTop = 700; });
  const after = await sidebar.boundingBox();
  const afterParts = await Promise.all([panel.boundingBox(), nav.boundingBox(), footer.boundingBox()]);
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
  for (let i = 0; i < beforeParts.length; i++) {
    expect(beforeParts[i]).not.toBeNull();
    expect(afterParts[i]).not.toBeNull();
    expect(Math.abs(afterParts[i]!.y - beforeParts[i]!.y)).toBeLessThanOrEqual(2);
  }
  expect(await sidebar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('responsive shell keeps drawer usable at tablet/mobile widths', async ({ page }) => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 900, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await login(page);
    await expect(page.locator('#app-sidebar-navigation')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport.width <= 900) {
      const menu = page.locator('.app-mobile-menu-button');
      await expect(menu).toBeVisible();
      await menu.click();
      const backdrop = page.locator('.app-sidebar-backdrop');
      const panel = page.locator('.app-sidebar__panel');
      await expect(backdrop).toBeVisible();
      const panelBox = await panel.boundingBox();
      const viewportSize = page.viewportSize();
      expect(panelBox).not.toBeNull();
      expect(viewportSize).not.toBeNull();
      const clickX = Math.min(viewportSize!.width - 10, panelBox!.x + panelBox!.width + 20);
      const clickY = 40;
      expect(clickX).toBeGreaterThan(panelBox!.x + panelBox!.width);
      await page.mouse.click(clickX, clickY);
      await expect(backdrop).toBeHidden();
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(backdrop).toBeHidden();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      const closedState = await panel.evaluate((el) => ({ className: el.className }));
      expect(closedState.className).not.toContain('is-open');
      const viewport = page.viewportSize()!;
      await expect.poll(async () => panel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.right <= 1 || rect.left >= viewport.width - 1;
      })).toBe(true);
      const closedRect = await panel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      });
      const outsideViewport = closedRect.right <= 1 || closedRect.left >= viewport.width - 1;
      expect(outsideViewport).toBe(true);
      await page.locator('.app-main').click({ position: { x: 10, y: 10 } });
    }
  }
});
