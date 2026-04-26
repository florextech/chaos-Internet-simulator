import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

type MockState = {
  enabled: boolean;
  profileId: string;
  targetBaseUrl: string;
  profileRules: Array<{ match: string; profile: string }>;
  customProfiles: Record<string, unknown>;
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
    downloadKbps?: number;
  };
  scenario: {
    name: string;
    loop: boolean;
    stepIndex: number;
    currentProfile: string;
    stepEndsAt: string;
  } | null;
};

const createFetchMock = () => {
  let state: MockState = {
    enabled: false,
    profileId: 'slow-3g',
    targetBaseUrl: 'https://jsonplaceholder.typicode.com',
    profileRules: [],
    customProfiles: {},
    rules: {
      delayMs: 2500,
      errorRatePercent: 2,
      timeoutRatePercent: 1,
      timeoutMs: 10000,
    },
    scenario: null,
  };
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

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/health')) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }
    if (url.endsWith('/state') && (!init || init.method === 'GET')) {
      return new Response(JSON.stringify(state), { status: 200 });
    }
    if (url.endsWith('/profiles')) {
      return new Response(
        JSON.stringify({
          profiles: [
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
          ],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/logs')) {
      return new Response(JSON.stringify(logs), { status: 200 });
    }
    if (url.endsWith('/metrics')) {
      return new Response(
        JSON.stringify({
          totalRequests: logs.length,
          delayedRequests: 0,
          erroredRequests: 0,
          timedOutRequests: 0,
          throttledRequests: 0,
          droppedConnections: 0,
          averageResponseTimeMs: 100,
          activeProfile: state.profileId,
          activeScenario: state.scenario?.name ?? null,
          chaosEnabled: state.enabled,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/state/enabled') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { enabled: boolean };
      state = { ...state, enabled: body.enabled };
      return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
    }
    if (url.endsWith('/state/profile') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { profileId: string };
      const profileMap: Record<string, MockState['rules']> = {
        'slow-3g': { delayMs: 2500, errorRatePercent: 2, timeoutRatePercent: 1, timeoutMs: 10000 },
        'airport-wifi': {
          delayMs: 4000,
          errorRatePercent: 8,
          timeoutRatePercent: 5,
          timeoutMs: 12000,
        },
        'unstable-api': {
          delayMs: 1200,
          errorRatePercent: 25,
          timeoutRatePercent: 10,
          timeoutMs: 8000,
        },
        'total-chaos': {
          delayMs: 5000,
          errorRatePercent: 40,
          timeoutRatePercent: 25,
          timeoutMs: 15000,
        },
      };
      state = { ...state, profileId: body.profileId, rules: profileMap[body.profileId] };
      return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
    }
    if (url.endsWith('/state/target-base-url') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { targetBaseUrl: string };
      state = { ...state, targetBaseUrl: body.targetBaseUrl };
      return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
    }
    if (url.endsWith('/state/rules') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { rules: MockState['profileRules'] };
      state = { ...state, profileRules: body.rules };
      return new Response(JSON.stringify({ ok: true, state }), { status: 200 });
    }
    if (url.endsWith('/profiles/custom') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  });
};

describe('dashboard app', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders status, state and logs from API', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Control API: connected')).toBeInTheDocument();
    });
    expect(screen.getByText('Chaos Internet Simulator')).toBeInTheDocument();
    expect(screen.getByText('2500 ms')).toBeInTheDocument();
    expect(screen.getByText('Recent Requests')).toBeInTheDocument();
    expect(screen.getByText('/posts/1')).toBeInTheDocument();
    expect(screen.getByText('Total requests')).toBeInTheDocument();
  });

  it('toggles chaos status', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enable chaos' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enable chaos' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disable chaos' })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8081/state/enabled',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('changes profile and updates rules', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('slow-3g')).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'unstable-api' } });

    await waitFor(() => {
      expect(screen.getByText('1200 ms')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8081/state/profile',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows disconnected status when health call fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Control API: disconnected')).toBeInTheDocument();
    });
  });

  it('renders throttle info when log entry includes bandwidth limit', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.endsWith('/state') && (!init || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            profileId: 'slow-3g',
            targetBaseUrl: 'https://jsonplaceholder.typicode.com',
            profileRules: [],
            customProfiles: {},
            rules: { delayMs: 2500, errorRatePercent: 2, timeoutRatePercent: 1, timeoutMs: 10000 },
            scenario: null,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/profiles')) {
        return new Response(
          JSON.stringify({
            profiles: [{ id: 'slow-3g', source: 'preset', rules: { delayMs: 2500 } }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/logs')) {
        return new Response(
          JSON.stringify([
            {
              method: 'GET',
              url: '/slow',
              profile: 'slow-3g',
              chaosEnabled: true,
              delayApplied: true,
              errorApplied: false,
              timeoutApplied: false,
              throttlingApplied: true,
              downloadKbpsApplied: 50,
              statusCode: 200,
              appliedRule: null,
              timestamp: new Date().toISOString(),
            },
          ]),
          { status: 200 },
        );
      }
      if (url.endsWith('/metrics')) {
        return new Response(
          JSON.stringify({
            totalRequests: 1,
            delayedRequests: 1,
            erroredRequests: 0,
            timedOutRequests: 0,
            throttledRequests: 1,
            droppedConnections: 0,
            averageResponseTimeMs: 1500,
            activeProfile: 'slow-3g',
            activeScenario: null,
            chaosEnabled: true,
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('50 kbps')).toBeInTheDocument();
    });
  });

  it('updates target url from web configuration', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://jsonplaceholder.typicode.com')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('https://jsonplaceholder.typicode.com'), {
      target: { value: 'https://api.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save URL' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8081/state/target-base-url',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('saves URL rules and custom profiles from web configuration', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Add rule' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }));
    fireEvent.change(screen.getByPlaceholderText('/payments or api.example.com'), {
      target: { value: '/payments' },
    });
    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: 'unstable-api' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8081/state/rules',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    fireEvent.change(screen.getByPlaceholderText('profile-name'), {
      target: { value: 'my-web-profile' },
    });
    fireEvent.change(screen.getByPlaceholderText('downloadKbps (optional)'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save custom profile' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8081/profiles/custom',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  });

  it('shows error message when target URL update fails', async () => {
    const baseFetchMock = createFetchMock();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/state/target-base-url') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400 });
      }
      return baseFetchMock(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save URL' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save URL' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid target URL or control API unavailable')).toBeInTheDocument();
    });
  });

  it('renders active scenario name from state', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      if (url.endsWith('/state') && (!init || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            profileId: 'slow-3g',
            targetBaseUrl: 'https://jsonplaceholder.typicode.com',
            profileRules: [],
            customProfiles: {},
            rules: { delayMs: 2500, errorRatePercent: 2, timeoutRatePercent: 1, timeoutMs: 10000 },
            scenario: {
              name: 'bad-mobile-network',
              loop: true,
              stepIndex: 1,
              currentProfile: 'slow-3g',
              stepEndsAt: new Date(Date.now() + 5000).toISOString(),
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/profiles')) {
        return new Response(
          JSON.stringify({
            profiles: [{ id: 'slow-3g', source: 'preset', rules: { delayMs: 2500 } }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/logs')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith('/metrics')) {
        return new Response(
          JSON.stringify({
            totalRequests: 0,
            delayedRequests: 0,
            erroredRequests: 0,
            timedOutRequests: 0,
            throttledRequests: 0,
            droppedConnections: 0,
            averageResponseTimeMs: 0,
            activeProfile: 'slow-3g',
            activeScenario: 'bad-mobile-network',
            chaosEnabled: true,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Scenario: bad-mobile-network')).toBeInTheDocument();
    });
  });

  it('shows error when rules update fails', async () => {
    const baseFetchMock = createFetchMock();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/state/rules') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'bad rules' }), { status: 500 });
      }
      return baseFetchMock(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Add rule' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }));
    fireEvent.change(screen.getByPlaceholderText('/payments or api.example.com'), {
      target: { value: '/payments' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to update URL rules')).toBeInTheDocument();
    });
  });

  it('shows error when custom profile save fails', async () => {
    const baseFetchMock = createFetchMock();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/profiles/custom') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'bad profile' }), { status: 500 });
      }
      return baseFetchMock(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('profile-name')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('profile-name'), {
      target: { value: 'broken-profile' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save custom profile' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save custom profile')).toBeInTheDocument();
    });
  });

  it('refreshes logs on polling interval', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((handler: TimerHandler) => {
        if (typeof handler === 'function') {
          handler();
        }
        return 1 as unknown as ReturnType<typeof setInterval>;
      });

    render(<App />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8081/logs');
    });

    setIntervalSpy.mockRestore();
  });

  it('updates all custom profile form fields from web inputs', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('profile-name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('profile-name'), {
      target: { value: 'my-custom' },
    });
    fireEvent.change(screen.getByPlaceholderText('delayMs'), {
      target: { value: '3200' },
    });
    fireEvent.change(screen.getByPlaceholderText('errorRatePercent'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByPlaceholderText('timeoutRatePercent'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByPlaceholderText('timeoutMs'), {
      target: { value: '11000' },
    });
    fireEvent.change(screen.getByPlaceholderText('downloadKbps (optional)'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save custom profile' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8081/profiles/custom',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
