import * as api from './api';

// Unit-tests the API client's contract without a server: it must hit the right path with the right
// body, unwrap the { success, message, data } envelope, and turn a network failure into a friendly
// { success: false } instead of throwing.
describe('api client', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('posts login to /auth/login and returns the envelope', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, message: 'ok', data: 'jwt-token' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await api.login('a@b.com', 'secret');

    expect(res).toEqual({ success: true, message: 'ok', data: 'jwt-token' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com', password: 'secret' });
  });

  it('sends the register payload to /auth/register', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, message: 'ok', data: 'jwt' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.register({ email: 'x@y.com', password: 'p', name: 'N', phone: '1', document: 'D', type: 'driver' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/auth/register');
    expect(JSON.parse(init.body).type).toBe('driver');
  });

  it('reports a network failure as a friendly envelope rather than throwing', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const res = await api.login('a@b.com', 'secret');

    expect(res.success).toBe(false);
    expect(res.message).toBe('No se pudo conectar con el servidor.');
  });

  it('posts the email to /auth/forgot-password', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, message: 'ok', data: null }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.forgotPassword('a@b.com');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/auth/forgot-password');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com' });
  });

  it('posts the token and new password to /auth/reset-password', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ success: true, message: 'ok', data: null }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await api.resetPassword('the-token', 'NewPass123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/auth/reset-password');
    expect(JSON.parse(init.body)).toEqual({ token: 'the-token', newPassword: 'NewPass123' });
  });

  // The merchant home splits its list across these two: the queue whole, the finished orders a
  // page at a time. Asking the plain endpoint (the web's shape, everything) for the queue would
  // silently duplicate every history row into the active section.
  it('asks the merchant endpoints for the queue and one history page', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ success: true, message: 'ok', data: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // These are authenticated reads: without a token the client answers "Sesión no iniciada."
    // before it ever reaches fetch.
    api.setAuthToken('merchant-jwt');

    await api.merchantOrders(true);
    await api.merchantOrders();
    await api.merchantOrderHistory(10, 10);

    expect(fetchMock.mock.calls[0][0]).toContain('/delivery/orders/merchant?activeOnly=true');
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/delivery\/orders\/merchant$/);
    expect(fetchMock.mock.calls[2][0]).toContain('/delivery/orders/merchant/history?skip=10&take=10');
    api.setAuthToken(null);
  });

  // Confirming carries the queue time the modal collected; the no-argument form keeps sending the
  // empty body older servers were confirmed with.
  it('sends the queue minutes in the confirm body, or an empty body without them', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ success: true, message: 'ok', data: null }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    api.setAuthToken('merchant-jwt');

    await api.confirmMerchantOrder('o1', 15);
    await api.confirmMerchantOrder('o2', 0);
    await api.confirmMerchantOrder('o3');

    expect(fetchMock.mock.calls[0][0]).toContain('/delivery/orders/o1/confirm');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ queueMinutes: 15 });
    // 0 is a real answer ("empiezo ahora"), not an absence -- it must survive to the body.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ queueMinutes: 0 });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({});
    api.setAuthToken(null);
  });

  // The Productos tab reads the merchant's own catalogue, which is a different endpoint from the
  // marketplace one: that one takes a companyId from the caller and hides items not on sale.
  it('asks the merchant catalogue endpoint for one page, identifying no company', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      headers: { get: () => null },
      json: async () => ({ success: true, message: 'ok', data: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    api.setAuthToken('merchant-jwt');

    await api.merchantProducts(20, api.PRODUCT_PAGE_SIZE);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/delivery/products/merchant?skip=20&take=10');
    expect(url).not.toContain('companyId');
    api.setAuthToken(null);
  });

  it('returns a friendly failure when the network is down', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const res = await api.login('a@b.com', 'secret');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/servidor/i);
  });
});

// The bottom tab bar picks its destinations from the signed-in role, and every screen refetches
// me() when it gains focus. Reading the role from request state alone means rendering the client
// bar until that request lands, which a merchant sees as their menu changing each time they open
// Cuenta. These cover the cache that lets a screen answer synchronously instead.
// A 401 on an authenticated call is the shape a session expiring takes: the app was closed for a
// while and the stored token is no longer accepted. The client must end the session itself rather
// than hand the screen an "Error del servidor (401)" to render.
describe('expired session', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.setAuthToken(null);
    api.setUnauthorizedHandler(null);
    api.clearCachedMe();
  });

  it('drops the token and calls the handler when an authenticated read comes back 401', async () => {
    // A bare 401: no { success, message } envelope to parse, which is exactly what the API returns
    // for a rejected token.
    globalThis.fetch = jest.fn().mockResolvedValue({
      status: 401,
      headers: { get: () => null },
      json: async () => { throw new Error('no body'); },
    }) as unknown as typeof fetch;
    api.setAuthToken('stale-jwt');
    const onUnauthorized = jest.fn();
    api.setUnauthorizedHandler(onUnauthorized);

    const res = await api.me();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(false);
    expect(res.message).toBe(api.SESSION_EXPIRED);
    // The token is gone, so the next call does not repeat the round trip with a dead credential.
    expect((await api.me()).message).toBe('Sesión no iniciada.');
  });

  it('leaves an ordinary failure alone, so a 500 does not sign anyone out', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      status: 500,
      headers: { get: () => null },
      json: async () => { throw new Error('no body'); },
    }) as unknown as typeof fetch;
    api.setAuthToken('good-jwt');
    const onUnauthorized = jest.fn();
    api.setUnauthorizedHandler(onUnauthorized);

    const res = await api.me();

    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(res.message).toBe('Error del servidor (500).');
  });
});

describe('cached profile', () => {
  const originalFetch = globalThis.fetch;
  const mockMe = (data: any) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      // /auth/me is an authenticated read, so the mock needs the rotation header the client
      // inspects on every response -- and the caller needs a token, or get() answers
      // "Sesión no iniciada." before it ever reaches fetch.
      headers: { get: () => null },
      json: async () => ({ success: true, message: 'ok', data }),
    }) as unknown as typeof fetch;
    api.setAuthToken('merchant-jwt');
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.setAuthToken(null);
    api.clearCachedMe();
  });

  it('has nothing to offer before the first fetch', () => {
    api.clearCachedMe();
    expect(api.cachedMe()).toBeNull();
  });

  it('remembers the merchant flag so the bar can render before me() returns', async () => {
    api.clearCachedMe();
    mockMe({ email: 'm@x.com', isMerchant: true, isDriver: false, isClient: false });

    await api.me();

    expect(api.cachedMe()?.isMerchant).toBe(true);
  });

  it('keeps the last good profile when a refetch fails, rather than blanking the role', async () => {
    api.clearCachedMe();
    mockMe({ email: 'm@x.com', isMerchant: true });
    await api.me();

    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const res = await api.me();

    expect(res.success).toBe(false);
    expect(api.cachedMe()?.isMerchant).toBe(true);
  });

  it('forgets the profile on sign-out so the next account cannot inherit the bar', async () => {
    api.clearCachedMe();
    mockMe({ email: 'm@x.com', isMerchant: true });
    await api.me();
    expect(api.cachedMe()).not.toBeNull();

    api.clearCachedMe();

    expect(api.cachedMe()).toBeNull();
  });
});
