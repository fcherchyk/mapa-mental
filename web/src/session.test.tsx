import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewCache } from './map/viewCache';
import { FakeApi } from './test/fakeApi';
import { renderApp, sampleApi } from './test/renderApp';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session', () => {
  it.each(['/', '/n/x'])(
    'criterion_3: without a session, %s shows the login that goes to /api/auth/login',
    async (path) => {
      const api = sampleApi();
      api.loggedIn = false;
      renderApp(path, api);
      expect(await screen.findByRole('heading', { name: 'Mind Map' })).toBeInTheDocument();
      expect(screen.getByText('Sign in with your Google account to see your map.')).toBeInTheDocument();
      const button = screen.getByRole('link', { name: 'Sign in with Google' });
      expect(button).toHaveAttribute('href', '/api/auth/login');
      expect(api.callsTo('GET', /view/)).toHaveLength(0);
    },
  );

  it('criterion_3: a later 401 (expired session) goes back to the login screen', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    fireEvent.click(await screen.findByTestId('node-b'));
    api.loggedIn = false;
    await user.keyboard('{F2}');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'No session' } });
    fireEvent.blur(screen.getByLabelText('Title'));
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('criterion_4: Sign out calls logout with X-CSRF, clears the cache and shows the login', async () => {
    const clear = vi.spyOn(ViewCache.prototype, 'clear');
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
    const [logout] = api.callsTo('POST', '/api/auth/logout');
    expect(logout.headers['X-CSRF']).toBe('1');
    expect(clear).toHaveBeenCalled();
  });

  it('if the API does not respond a notice is shown', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url === '/api/me', 502);
    renderApp('/', api);
    expect(await screen.findByText('Could not connect to the API.')).toBeInTheDocument();
  });

  it('an unknown route shows "Not found"', async () => {
    renderApp('/some/thing', sampleApi());
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('an error fetching the window shows a notice', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url.includes('/view'), 500);
    renderApp('/n/f', api);
    expect(await screen.findByText('Could not load the map.')).toBeInTheDocument();
  });
});

describe('preference N', () => {
  it("criterion_16: choosing 5 calls PATCH /api/me/settings and requests the focus's view?depth=5", async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    const select = screen.getByRole('combobox', { name: 'Visible levels' });
    expect(select).toHaveValue('3');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    await user.selectOptions(select, '5');
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=5')).toHaveLength(1));
    const [patch] = api.callsTo('PATCH', '/api/me/settings');
    expect(patch.body).toEqual({ depth: 5 });
    expect(patch.headers['X-CSRF']).toBe('1');
  });

  it('criterion_16: if the PATCH fails it goes back to the previous value and notifies', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url === '/api/me/settings', 500);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    const select = screen.getByRole('combobox', { name: 'Visible levels' });
    await user.selectOptions(select, '2');
    expect(await screen.findByRole('alert')).toHaveTextContent('levels');
    expect(select).toHaveValue('3');
  });
});

describe('security', () => {
  it('criterion_17: a title with HTML is shown as text on the canvas and in the breadcrumb', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: malicious, sort_key: 'V' },
      { id: 'f', parent_id: 'root', title: malicious, sort_key: 'V' },
      { id: 'c', parent_id: 'f', title: malicious, sort_key: 'V' },
    ]);
    const { container } = renderApp('/n/f', api);
    expect(await screen.findByTestId('node-c')).toHaveTextContent(malicious);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: malicious })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('criterion_17: <script> and <svg> payloads do not inject elements into the DOM', async () => {
    const scriptPayload = '<script>alert(1)</script>';
    const svgPayload = '<svg onload=alert(1)>';
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: 'Root', sort_key: 'V' },
      { id: 'f', parent_id: 'root', title: scriptPayload, sort_key: 'V' },
      { id: 'c', parent_id: 'f', title: svgPayload, sort_key: 'V' },
    ]);
    const { container } = renderApp('/n/f', api);
    expect(await screen.findByTestId('node-c')).toHaveTextContent(svgPayload);
    expect(screen.getByTestId('node-f')).toHaveTextContent(scriptPayload);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('svg:not([class*="react-flow"])')).toBeNull();
  });
});
