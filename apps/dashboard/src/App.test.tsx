import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

type MockState = {
  enabled: boolean;
  profileId: string;
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
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
    if (url.endsWith('/logs')) {
      return new Response(JSON.stringify(logs), { status: 200 });
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
      expect(screen.getByDisplayValue('Slow 3G')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unstable-api' } });

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
            rules: { delayMs: 2500, errorRatePercent: 2, timeoutRatePercent: 1, timeoutMs: 10000 },
            scenario: null,
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

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('50 kbps')).toBeInTheDocument();
    });
  });
});
