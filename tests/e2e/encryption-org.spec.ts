import { test, expect } from '@playwright/test';
import {
  signInWithClerk,
  setupOrganizationMocks,
} from './fixtures/auth.fixture.js';
import {
  setupEncryption,
  setupEncryptionMocks,
  mockKeyCreation,
  setupOrgEncryptionMocks,
  setupOrgEncryptionMocksWithRealCrypto,
  createEncryptedStreamHandler,
  TEST_ORG_PUBLIC_KEY,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;

test.describe('Organization Encryption', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await setupEncryptionMocks(page);

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        ]),
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

  test('shows organization encryption status', async ({ page }) => {
    // Set up key creation mock and org encryption mocks
    await mockKeyCreation(page);
    await setupOrgEncryptionMocks(page);

    // Mock being in an organization context
    await page.route('**/api/v1/organizations/current', async (route) => {
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

    // Navigate to org encryption settings
    await page.goto('/org/test-org/settings/encryption');

    await expect(
      page.locator('[data-testid="org-encryption-enabled-badge"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('member can send encrypted org messages', async ({ page }) => {
    const capturedRequests: string[] = [];
    const keyMock = await mockKeyCreation(page);

    // Mock being in an organization context
    await page.route('**/api/v1/organizations/current', async (route) => {
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

    // Get user's public key and set up org mocks with real crypto
    const userPublicKey = keyMock.getPublicKey();
    if (userPublicKey) {
      await setupOrgEncryptionMocksWithRealCrypto(page, userPublicKey);
    } else {
      await setupOrgEncryptionMocks(page);
    }

    // Set up encrypted stream handler
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      capturedRequests.push(route.request().postData() || '');
      const handler = createEncryptedStreamHandler(['Org response.']);
      await handler(route);
    });

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Org secret message');
    await page.locator('[data-testid="send-button"]').click();

    await page.waitForTimeout(1000);

    // Verify request uses org key for encryption
    expect(capturedRequests.length).toBeGreaterThan(0);
    const lastRequest = JSON.parse(
      capturedRequests[capturedRequests.length - 1]
    );
    expect(lastRequest).toHaveProperty('org_id', 'org_test_123');
    expect(lastRequest).toHaveProperty('encrypted_message');
  });

  test('shows pending key distributions for admin', async ({ page }) => {
    await mockKeyCreation(page);
    await setupOrgEncryptionMocks(page);

    // Mock being in an organization context as admin
    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          org_name: 'Test Organization',
          org_slug: 'test-org',
          org_role: 'org:admin',
          is_personal_context: false,
          is_org_admin: true,
        }),
      });
    });

    await page.route(
      '**/api/v1/organizations/org_test_123/pending-distributions',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pending_members: [
              {
                user_id: 'user_pending_1',
                email: 'pending@test.com',
                public_key:
                  '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
              },
            ],
          }),
        });
      }
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    await page.goto('/org/test-org/members');

    await expect(
      page.locator('[data-testid="pending-distributions-section"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(page.locator('text=pending@test.com')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });
  });

  test('admin can distribute org key to member', async ({ page }) => {
    let keyDistributed = false;
    const keyMock = await mockKeyCreation(page);

    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          is_org_admin: true,
          is_personal_context: false,
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    // Get user's public key and set up org mocks with real crypto
    const userPublicKey = keyMock.getPublicKey();
    if (userPublicKey) {
      await setupOrgEncryptionMocksWithRealCrypto(page, userPublicKey);
    } else {
      await setupOrgEncryptionMocks(page);
    }

    await page.route(
      '**/api/v1/organizations/org_test_123/pending-distributions',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pending_members: keyDistributed
              ? []
              : [
                  {
                    user_id: 'user_pending_1',
                    email: 'pending@test.com',
                    public_key:
                      '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
                  },
                ],
          }),
        });
      }
    );

    await page.route(
      '**/api/v1/organizations/org_test_123/distribute-key',
      async (route) => {
        keyDistributed = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'distributed' }),
        });
      }
    );

    await page.goto('/org/test-org/members');

    await page.locator('[data-testid="distribute-key-user_pending_1"]').click();

    // Should prompt for admin passcode to decrypt org key
    await expect(
      page.locator('[data-testid="admin-passcode-input"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    await page.locator('[data-testid="admin-passcode-input"]').fill('123456');
    await page.locator('[data-testid="confirm-distribute-button"]').click();

    await expect(
      page.locator('[data-testid="distribution-success"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });
});

test.describe('Organization Encryption Setup (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await setupEncryptionMocks(page);

    // Org has no encryption keys yet
    await page.route(
      '**/api/v1/organizations/*/encryption-status',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            has_encryption_keys: false,
            org_public_key: null,
          }),
        });
      }
    );

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

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        ]),
      });
    });

    await signInWithClerk(page);
  });

  test('admin can create org encryption keys', async ({ page }) => {
    await mockKeyCreation(page);

    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          org_name: 'Test Organization',
          is_org_admin: true,
          is_personal_context: false,
        }),
      });
    });

    await page.route(
      '**/api/v1/organizations/org_test_123/keys',
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'created',
              org_public_key: TEST_ORG_PUBLIC_KEY,
            }),
          });
        } else {
          await route.continue();
        }
      }
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up user encryption first
    await setupEncryption(page);

    await page.goto('/org/test-org/settings/encryption');

    await expect(
      page.locator('[data-testid="setup-org-encryption-prompt"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    await page.locator('[data-testid="org-passcode-input"]').fill('orgpass123');
    await page
      .locator('[data-testid="org-passcode-confirm-input"]')
      .fill('orgpass123');
    await page.locator('[data-testid="create-org-keys-button"]').click();

    await expect(
      page.locator('[data-testid="org-encryption-enabled-badge"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('non-admin cannot access org encryption setup', async ({ page }) => {
    await mockKeyCreation(page);

    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          is_org_admin: false,
          is_personal_context: false,
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up user encryption first
    await setupEncryption(page);

    await page.goto('/org/test-org/settings/encryption');

    await expect(
      page.locator('[data-testid="admin-required-message"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    await expect(
      page.locator('[data-testid="create-org-keys-button"]')
    ).not.toBeVisible();
  });
});

test.describe('Organization Member Key Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await setupEncryptionMocks(page);

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

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        ]),
      });
    });

    await signInWithClerk(page);
  });

  test('admin can re-distribute key to member who lost access', async ({
    page,
  }) => {
    const keyMock = await mockKeyCreation(page);

    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          org_name: 'Test Organization',
          is_org_admin: true,
          is_personal_context: false,
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up user encryption first
    await setupEncryption(page);

    // Get user's public key and set up org mocks with real crypto
    const userPublicKey = keyMock.getPublicKey();
    if (userPublicKey) {
      await setupOrgEncryptionMocksWithRealCrypto(page, userPublicKey);
    } else {
      await setupOrgEncryptionMocks(page);
    }

    await page.route(
      '**/api/v1/organizations/org_test_123/members',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            members: [
              {
                user_id: 'user_member_1',
                email: 'member@test.com',
                has_org_key: false,
                public_key:
                  '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
              },
            ],
          }),
        });
      }
    );

    await page.route(
      '**/api/v1/organizations/org_test_123/distribute-key',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'distributed' }),
        });
      }
    );

    await page.goto('/org/test-org/members');

    // Member without org key should show re-distribute option
    await expect(
      page.locator('[data-testid="redistribute-key-user_member_1"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    await page
      .locator('[data-testid="redistribute-key-user_member_1"]')
      .click();

    await page.locator('[data-testid="admin-passcode-input"]').fill('123456');
    await page.locator('[data-testid="confirm-distribute-button"]').click();

    await expect(
      page.locator('[data-testid="distribution-success"]')
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });
});

test.describe('Organization Encryption Audit', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await setupEncryptionMocks(page);

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

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        ]),
      });
    });

    await signInWithClerk(page);
  });

  test('admin can view encryption audit log', async ({ page }) => {
    const keyMock = await mockKeyCreation(page);

    await page.route('**/api/v1/organizations/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          org_id: 'org_test_123',
          org_name: 'Test Organization',
          is_org_admin: true,
          is_personal_context: false,
        }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up user encryption first
    await setupEncryption(page);

    // Get user's public key and set up org mocks with real crypto
    const userPublicKey = keyMock.getPublicKey();
    if (userPublicKey) {
      await setupOrgEncryptionMocksWithRealCrypto(page, userPublicKey);
    } else {
      await setupOrgEncryptionMocks(page);
    }

    await page.route(
      '**/api/v1/organizations/org_test_123/encryption-audit',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            audit_entries: [
              {
                id: 'audit-1',
                event_type: 'key_distributed',
                target_user_email: 'member@test.com',
                performed_by_email: 'admin@test.com',
                timestamp: new Date().toISOString(),
              },
              {
                id: 'audit-2',
                event_type: 'org_keys_created',
                performed_by_email: 'admin@test.com',
                timestamp: new Date(
                  Date.now() - 24 * 60 * 60 * 1000
                ).toISOString(),
              },
            ],
          }),
        });
      }
    );

    await page.goto('/org/test-org/settings/encryption/audit');

    await expect(page.locator('[data-testid="audit-log-table"]')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });
    await expect(page.locator('text=key_distributed')).toBeVisible();
    await expect(page.locator('text=org_keys_created')).toBeVisible();
  });
});
