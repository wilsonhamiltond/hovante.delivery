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

  it('returns a friendly failure when the network is down', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const res = await api.login('a@b.com', 'secret');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/servidor/i);
  });
});
