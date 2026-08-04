import { isProfileComplete, type Me } from './api';
import { splitDisplayName, toIsoDate } from './profileForm';

const account = (over: Partial<Me>): Me => ({
  email: 'a@b.com',
  name: 'Ana',
  lastName: 'Pérez',
  phone: '809-000-0000',
  document: null,
  isClient: true,
  isDriver: false,
  address: 'Calle 1',
  addressLabel: 'Casa',
  latitude: null,
  longitude: null,
  ...over,
});

// What decides whether someone is sent to the completion form. It must match what the API refuses
// to save without, or the app either traps people in a form the server rejects or lets a half-set-up
// account into the app.
describe('isProfileComplete', () => {
  it('accepts an account with name, surname, phone and address', () => {
    expect(isProfileComplete(account({}))).toBe(true);
  });

  it('rejects the account a social sign-in mints (display name only)', () => {
    expect(isProfileComplete(account({ lastName: null, phone: null, address: null }))).toBe(false);
  });

  it.each(['name', 'lastName', 'phone', 'address'] as const)('rejects a missing %s', (field) => {
    expect(isProfileComplete(account({ [field]: null }))).toBe(false);
    expect(isProfileComplete(account({ [field]: '   ' }))).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isProfileComplete(null)).toBe(false);
  });
});

describe('splitDisplayName', () => {
  it('splits the provider display name into name and surname', () => {
    expect(splitDisplayName('Ana Pérez')).toEqual({ name: 'Ana', lastName: 'Pérez' });
  });

  it('keeps every remaining word as the surname', () => {
    expect(splitDisplayName('Ana María Pérez Gómez')).toEqual({ name: 'Ana', lastName: 'María Pérez Gómez' });
  });

  it('leaves the surname empty for a single word', () => {
    expect(splitDisplayName('Ana')).toEqual({ name: 'Ana', lastName: '' });
  });

  it('handles a missing or blank name', () => {
    expect(splitDisplayName(null)).toEqual({ name: '', lastName: '' });
    expect(splitDisplayName('   ')).toEqual({ name: '', lastName: '' });
  });
});

describe('toIsoDate', () => {
  it('converts a real past date', () => {
    expect(toIsoDate('05/03/1990')).toBe('1990-03-05');
  });

  it('rejects an impossible or future date', () => {
    expect(toIsoDate('31/02/1990')).toBeNull();
    expect(toIsoDate('01/01/2999')).toBeNull();
    expect(toIsoDate('5/3/90')).toBeNull();
  });
});
