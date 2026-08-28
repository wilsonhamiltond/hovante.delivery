import { fireEvent, render, screen } from '@testing-library/react-native';
import NotificationsScreen from '../app/notifications';
import type { Notice } from './notifications';

// The screen itself, with the inbox stubbed: what is under test is the rendering and the "opening
// it counts as reading it" rule, not the reading of orders (notifications.test.ts covers that).

// The icon set pulls expo-font -> expo-asset, which npm has nested under expo/ where Node cannot
// resolve it (Metro can, which is why the app itself runs). Stubbed: nothing here is about icons.
jest.mock('@expo/vector-icons', () => ({ FontAwesome5: 'FontAwesome5' }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
  // Fire the effect immediately, the way a focused screen does.
  useFocusEffect: (cb: () => void | (() => void)) => cb(),
}));

const mockMarkAllRead = jest.fn().mockResolvedValue(undefined);
const mockDismiss = jest.fn().mockResolvedValue(undefined);
const mockDismissAll = jest.fn().mockResolvedValue(undefined);
let mockInbox: { list: Notice[]; read: string[]; loading: boolean };
jest.mock('./notifications', () => ({
  ...jest.requireActual('./notifications'),
  useNotices: () => ({
    ...mockInbox, markAllRead: mockMarkAllRead, dismiss: mockDismiss, dismissAll: mockDismissAll,
    unread: 0, reload: jest.fn(),
  }),
}));

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'o1:READY|ASSIGNED', orderId: 'o1',
  title: 'PED-1 · Repartidor asignado',
  body: 'Volao Test — Un repartidor tomó tu pedido.',
  color: '#2563eb',
  at: new Date(Date.now() - 5 * 60000).toISOString(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockInbox = { list: [], read: [], loading: false };
});

it('explains itself when there is nothing yet', async () => {
  await render(<NotificationsScreen />);

  expect(screen.getByText('No tienes notificaciones.')).toBeTruthy();
  expect(mockMarkAllRead).not.toHaveBeenCalled();
});

it('lists what happened, with how long ago', async () => {
  mockInbox = { list: [notice()], read: [], loading: false };

  await render(<NotificationsScreen />);

  expect(screen.getByText('PED-1 · Repartidor asignado')).toBeTruthy();
  expect(screen.getByText('Volao Test — Un repartidor tomó tu pedido.')).toBeTruthy();
  expect(screen.getByText('hace 5 min')).toBeTruthy();
});

// The badge has to clear by being looked at; making someone press "mark as read" to silence a
// number they have already read is the thing this screen exists to avoid.
it('counts opening the screen as reading them', async () => {
  mockInbox = { list: [notice()], read: [], loading: false };

  await render(<NotificationsScreen />);

  expect(mockMarkAllRead).toHaveBeenCalled();
});

// Tapping does two things at once: opens the order, and takes the entry off the list -- looking at
// the order is the end of that notice's life.
it('opens the order a notice is about, and clears the notice', async () => {
  mockInbox = { list: [notice()], read: [], loading: false };
  await render(<NotificationsScreen />);

  fireEvent.press(screen.getByText('PED-1 · Repartidor asignado'));

  expect(mockPush).toHaveBeenCalledWith('/order/o1');
  expect(mockDismiss).toHaveBeenCalledWith('o1:READY|ASSIGNED');
});

it('clears the whole inbox from the header button', async () => {
  mockInbox = { list: [notice()], read: [], loading: false };
  await render(<NotificationsScreen />);

  fireEvent.press(screen.getByText('Limpiar'));

  expect(mockDismissAll).toHaveBeenCalled();
});

// An empty inbox has nothing to clear, so the button would only be a dead control.
it('hides the clear button when there is nothing to clear', async () => {
  await render(<NotificationsScreen />);

  expect(screen.queryByText('Limpiar')).toBeNull();
});
