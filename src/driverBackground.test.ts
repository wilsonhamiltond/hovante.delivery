jest.mock('./api', () => ({
  driverHeartbeat: jest.fn(),
}));
jest.mock('./storage', () => ({ getToken: jest.fn() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

import * as api from './api';
import { beat, resetBeat } from './driverBackground';

const heartbeat = api.driverHeartbeat as jest.Mock;
const presence = { isOnline: true, offlineReason: null } as unknown as api.DriverPresence;

describe('beat', () => {
  beforeEach(() => {
    resetBeat();
    heartbeat.mockReset().mockResolvedValue({ success: true, message: '', data: presence });
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends the first beat and returns the server presence', async () => {
    await expect(beat(18.5, -69.9)).resolves.toBe(presence);
    expect(heartbeat).toHaveBeenCalledWith(18.5, -69.9);
  });

  it('throttles a second beat from the same spot within the interval', async () => {
    await beat(18.5, -69.9);
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 20_000);
    await expect(beat(18.5, -69.9)).resolves.toBeNull();
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it('beats again once the interval has passed, even standing still', async () => {
    await beat(18.5, -69.9);
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 60_000);
    await beat(18.5, -69.9);
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('beats early when the driver has moved', async () => {
    await beat(18.5, -69.9);
    (Date.now as jest.Mock).mockReturnValue(1_000_000 + 5_000);
    await beat(18.502, -69.9); // ~220 m north
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('returns null when the request fails', async () => {
    heartbeat.mockResolvedValue({ success: false, message: 'x', data: null });
    await expect(beat(18.5, -69.9, true)).resolves.toBeNull();
  });
});
