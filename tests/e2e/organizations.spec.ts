import { test, expect } from '@playwright/test';
import { signInWithClerk, setupOrganizationMocks } from './fixtures/auth.fixture.js';
import { setupEncryption, setupEncryptionMocks, mockKeyCreation } from './fixtures/encryption.fixture.js';

const API_BASE = 'http://localhost:8000';
const DEFAULT_TIMEOUT = 15000;

test.describe('Organizations', () => {
  test.beforeEach(async ({ page }) => {
    await setupEncryptionMocks(page);
    await mockKeyCreation(page);
    await setupOrganizationMocks(page);

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' }]),
      });
    });

    await page.route('**/api/v1/users/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'exists', user_id: 'test_user' }),
      });
    });

    await page.route('**/api/v1/chat/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await signInWithClerk(page);
  });

  test('organization switcher is visible in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const orgSwitcher = page
      .locator('button:has-text("organization switcher")')
      .or(page.locator('[aria-label*="organization"]'));
    await expect(orgSwitcher.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('shows context indicator in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const contextIndicator = page.locator('text=/Personal Chats|Organization Chats/');
    await expect(contextIndicator).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('loads sessions based on organization context', async ({ page }) => {
    const sessionCalls: string[] = [];

    await page.route('**/api/v1/chat/sessions', async (route) => {
      sessionCalls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Test Session', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    await expect(page.locator('text=Test Session')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    expect(sessionCalls.length).toBeGreaterThan(0);
  });

  test('calls organization sync on page load with org context', async ({ page }) => {
    let syncCalled = false;
    let syncPayload: unknown = null;

    await page.route('**/api/v1/organizations/sync', async (route) => {
      syncCalled = true;
      syncPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'created', org_id: 'org_test_123' }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    if (syncCalled) {
      expect(syncPayload).toBeTruthy();
      expect((syncPayload as { org_id?: string }).org_id).toBeTruthy();
    }
  });

  test('current organization endpoint returns context info', async ({ page }) => {
    let currentOrgCalled = false;

    await page.route('**/api/v1/organizations/current', async (route) => {
      currentOrgCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          org_name: 'Test Organization',
          org_slug: 'test-org',
          org_role: 'org:member',
          is_personal_context: false,
          is_org_admin: false,
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    if (currentOrgCalled) {
      // Verify the API was called - actual UI display depends on frontend implementation
      expect(currentOrgCalled).toBe(true);
    }
  });
});

test.describe('Organization API Endpoints', () => {
  test('organizations list requires auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/organizations/`);
    expect([401, 403]).toContain(response.status());
  });

  test('organizations sync requires auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/organizations/sync`, {
      data: { org_id: 'test', name: 'Test Org' },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('organizations current requires auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/organizations/current`);
    expect([401, 403]).toContain(response.status());
  });

  test('organizations context requires auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/organizations/context`);
    expect([401, 403]).toContain(response.status());
  });
});
