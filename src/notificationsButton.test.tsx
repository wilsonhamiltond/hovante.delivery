import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationsButton } from './NotificationsButton';

// The bell every home wears. Its whole job is the count and the destination, so that is what is
// checked -- for a driver's audience as much as a customer's, since the same button serves both.

jest.mock('@expo/vector-icons', () => ({ FontAwesome5: 'FontAwesome5' }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void | (() => void)) => cb(),
}));

let mockUnread = 0;
const mockUseNotices = jest.fn();
jest.mock('./notifications', () => ({
  useNotices: (audience: string) => { mockUseNotices(audience); return { unread: mockUnread }; },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUnread = 0;
});

it('stays quiet when there is nothing unread', async () => {
  await render(<NotificationsButton audience="client" />);

  expect(screen.queryByText('0')).toBeNull();
  expect(screen.getByLabelText('Notificaciones')).toBeTruthy();
});

it('wears the count, and says it out loud for a screen reader', async () => {
  mockUnread = 3;

  await render(<NotificationsButton audience="merchant" />);

  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones, 3 sin leer')).toBeTruthy();
});

// Past 99 the number stops being worth reading and starts breaking the circle it sits in.
it('caps the badge at 99+', async () => {
  mockUnread = 128;

  await render(<NotificationsButton audience="client" />);

  expect(screen.getByText('99+')).toBeTruthy();
});

it('asks for the inbox of whoever is wearing it', async () => {
  await render(<NotificationsButton audience="driver" />);

  expect(mockUseNotices).toHaveBeenCalledWith('driver');
});

it('opens the notifications screen', async () => {
  await render(<NotificationsButton audience="client" />);

  fireEvent.press(screen.getByLabelText('Notificaciones'));

  expect(mockPush).toHaveBeenCalledWith('/notifications');
});
