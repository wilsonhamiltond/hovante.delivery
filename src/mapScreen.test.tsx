import { render, screen } from '@testing-library/react-native';
import MapScreen from '../app/map';

// The map screen is parameter plumbing: which stops it hands RouteMap decides whether a route is
// drawn at all. RouteMap itself is stubbed -- what matters here is what it is asked to draw.

jest.mock('@expo/vector-icons', () => ({ FontAwesome5: 'FontAwesome5' }));

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

const mockRouteMap = jest.fn();
jest.mock('../src/RouteMap', () => ({
  RouteMap: (props: unknown) => { mockRouteMap(props); return null; },
}));

// The device position, controllable per test. The screen only tracks when the opener asked
// (me=1), so the mock records the enabled flag it was called with.
const mockUseDriverPosition = jest.fn().mockReturnValue(null);
jest.mock('../src/position', () => ({
  useDriverPosition: (enabled?: boolean) => mockUseDriverPosition(enabled),
  useCoarsePosition: (p: unknown) => p,
}));

// The estimate is a network call; the plumbing under test is which stops and driver reach the
// map, so it stays silent here.
jest.mock('../src/eta', () => ({
  ...jest.requireActual('../src/eta'),
  useRouteEta: jest.fn().mockReturnValue(null),
}));

const CLIENT = { lat: '18.4761', lng: '-69.9412', address: 'Calle 1, Piantini' };
const OFFICE = { olat: '18.4861', olng: '-69.9312', oaddress: 'Av. Churchill', otitle: 'Volao Test' };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDriverPosition.mockReturnValue(null);
  mockParams = {};
});

const stops = () => mockRouteMap.mock.calls[0][0] as {
  pickup: { lat: number | null; title: string; imageUrl: string | null };
  client: { lat: number | null; title: string; imageUrl: string | null };
  driver: { lat: number; lng: number } | null;
};

it('draws the route between the branch and the delivery address when both are given', async () => {
  mockParams = { ...CLIENT, ...OFFICE, title: 'Tu dirección' };

  await render(<MapScreen />);

  expect(stops().pickup.lat).toBe(18.4861);
  expect(stops().pickup.title).toBe('Volao Test');
  expect(stops().client.lat).toBe(18.4761);
});

// The order screen omits the branch until its offices have loaded, and a merchant whose branches
// were never geocoded never sends one at all. Either way the screen must still show the address.
it('stays a single pin when no branch came with it', async () => {
  mockParams = { ...CLIENT, title: 'Entregar en' };

  await render(<MapScreen />);

  expect(stops().pickup.lat).toBeNull();
  expect(stops().client.lat).toBe(18.4761);
});

// A branch that has an address but no pin is still a stop: RouteMap geocodes it.
it('accepts a branch known only by its address', async () => {
  mockParams = { ...CLIENT, oaddress: 'Av. Churchill', otitle: 'Volao Test' };

  await render(<MapScreen />);

  expect(stops().pickup.lat).toBeNull();
  expect(stops().pickup.title).toBe('Volao Test');
});

// The faces are what the pins wear instead of a numbered teardrop: the customer's photo on their
// door, the shop's logo on the branch.
it('hands each pin the face that belongs to it', async () => {
  mockParams = {
    ...CLIENT, ...OFFICE,
    img: 'https://cdn.example/customer.jpg',
    oimg: 'https://cdn.example/logo.png',
  };

  await render(<MapScreen />);

  expect(stops().client.imageUrl).toBe('https://cdn.example/customer.jpg');
  expect(stops().pickup.imageUrl).toBe('https://cdn.example/logo.png');
});

// A customer who never set a photo, or a merchant with no logo: the pin keeps its teardrop rather
// than trying to draw nothing.
it('leaves a pin plain when its face is missing', async () => {
  mockParams = { ...CLIENT, ...OFFICE };

  await render(<MapScreen />);

  expect(stops().client.imageUrl).toBeNull();
  expect(stops().pickup.imageUrl).toBeNull();
});

// The driver screens open the map with me=1: their own live position becomes the route's origin,
// so the single pin turns into the ride to it.
it('routes from the device when the opener asked (me=1)', async () => {
  mockUseDriverPosition.mockReturnValue({ lat: 18.5, lng: -69.95, accuracyM: 12 });
  mockParams = { ...CLIENT, title: 'Entregar', me: '1' };

  await render(<MapScreen />);

  expect(mockUseDriverPosition).toHaveBeenCalledWith(true);
  expect(stops().driver).toEqual({ lat: 18.5, lng: -69.95, accuracyM: 12 });
});

// A client reading their own order must never be prompted for a location permission: without
// me=1 the tracking hook is disabled and no driver dot reaches the map.
it('never tracks the device when the opener did not ask', async () => {
  mockUseDriverPosition.mockReturnValue({ lat: 18.5, lng: -69.95, accuracyM: 12 });
  mockParams = { ...CLIENT, ...OFFICE, title: 'Tu dirección' };

  await render(<MapScreen />);

  expect(mockUseDriverPosition).toHaveBeenCalledWith(false);
  expect(stops().driver).toBeNull();
});

it('says so when the order has no location at all', async () => {
  mockParams = { title: 'Entregar en' };

  await render(<MapScreen />);

  expect(screen.getByText('Esta dirección no tiene ubicación.')).toBeTruthy();
  expect(mockRouteMap).not.toHaveBeenCalled();
});
