import { expect, test, type Page, type Route } from '@playwright/test';

type Rule = { match: string; profile: string };

const setupControlApiMock = async (page: Page) => {
  const state = {
    enabled: false,
    profileId: 'slow-3g',
    targetBaseUrl: 'https://jsonplaceholder.typicode.com',
    profileRules: [] as Rule[],
    customProfiles: {},
    rules: {
      delayMs: 2500,
      errorRatePercent: 2,
      timeoutRatePercent: 1,
      timeoutMs: 10000,
      downloadKbps: 50,
    },
    scenario: null,
  };

  const profiles = [
    { id: 'slow-3g', source: 'preset', rules: state.rules },
    {
      id: 'unstable-api',
      source: 'preset',
      rules: {
        delayMs: 1200,
        errorRatePercent: 25,
        timeoutRatePercent: 10,
        timeoutMs: 8000,
      },
    },
  ];

  const logs = [
    {
      method: 'GET',
      url: '/posts/1',
      profile: 'slow-3g',
      chaosEnabled: false,
      delayApplied: false,
      errorApplied: false,
      timeoutApplied: false,
      throttlingApplied: false,
      downloadKbpsApplied: null,
      statusCode: 200,
      appliedRule: null,
      timestamp: new Date().toISOString(),
    },
  ];

  await page.route('**/health', (route: Route) => route.fulfill({ status: 200, json: { status: 'ok' } }));
  await page.route('**/state', (route: Route) => route.fulfill({ status: 200, json: state }));
  await page.route('**/profiles', (route: Route) => route.fulfill({ status: 200, json: { profiles } }));
  await page.route('**/logs', (route: Route) => route.fulfill({ status: 200, json: logs }));
  await page.route('**/metrics', (route: Route) =>
    route.fulfill({
      status: 200,
      json: {
        totalRequests: logs.length,
        delayedRequests: 0,
        erroredRequests: 0,
        timedOutRequests: 0,
        throttledRequests: 0,
        droppedConnections: 0,
        averageResponseTimeMs: 180,
        activeProfile: state.profileId,
        activeScenario: state.scenario,
        chaosEnabled: state.enabled,
      },
    }),
  );

  await page.route('**/state/enabled', async (route: Route) => {
    const body = route.request().postDataJSON() as { enabled: boolean };
    state.enabled = body.enabled;
    await route.fulfill({ status: 200, json: { ok: true, state } });
  });

  await page.route('**/state/profile', async (route: Route) => {
    const body = route.request().postDataJSON() as { profileId: string };
    state.profileId = body.profileId;
    await route.fulfill({ status: 200, json: { ok: true, state } });
  });

  await page.route('**/state/target-base-url', async (route: Route) => {
    const body = route.request().postDataJSON() as { targetBaseUrl: string };
    state.targetBaseUrl = body.targetBaseUrl;
    await route.fulfill({ status: 200, json: { ok: true, state } });
  });

  await page.route('**/state/rules', async (route: Route) => {
    const body = route.request().postDataJSON() as { rules: Rule[] };
    state.profileRules = body.rules;
    await route.fulfill({ status: 200, json: { ok: true, state } });
  });

  await page.route('**/profiles/custom', (route: Route) =>
    route.fulfill({ status: 200, json: { ok: true } }),
  );
};

test.describe('dashboard e2e', () => {
  test('renders main state from control API', async ({ page }) => {
    await setupControlApiMock(page);
    await page.goto('/');

    await expect(page.getByText('Chaos Internet Simulator')).toBeVisible();
    await expect(page.getByText('Control API: connected')).toBeVisible();
    await expect(page.getByText('Recent Requests')).toBeVisible();
    await expect(page.getByText('/posts/1')).toBeVisible();
  });

  test('allows toggling chaos and saving config actions', async ({ page }) => {
    await setupControlApiMock(page);
    await page.goto('/');

    const enableButton = page.getByRole('button', { name: 'Enable chaos' });
    await expect(enableButton).toBeVisible();
    await enableButton.click();
    await expect(page.getByRole('button', { name: 'Disable chaos' })).toBeVisible();

    await page.getByPlaceholder('https://jsonplaceholder.typicode.com').fill('https://api.example.com');
    await page.getByRole('button', { name: 'Save URL' }).click();
    await expect(page.getByText('Target URL updated')).toBeVisible();

    await page.getByRole('button', { name: '+ Add rule' }).click();
    await page.getByPlaceholder('/payments or api.example.com').fill('/payments');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.getByText('URL rules updated')).toBeVisible();
  });
});
