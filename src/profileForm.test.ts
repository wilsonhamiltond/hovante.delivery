import { isProfileComplete, type Me } from './api';
import { isCompletePhone, maskPhone, splitDisplayName } from './profileForm';

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

// The phone field accepts exactly one shape, so the mask is what enforces it -- typing, pasting a
// number that already carries punctuation, and deleting all have to land in the same format.
describe('maskPhone', () => {
  it('formats progressively as digits are typed', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone('8')).toBe('(8');
    expect(maskPhone('809')).toBe('(809');
    expect(maskPhone('8095')).toBe('(809) 5');
    expect(maskPhone('809555')).toBe('(809) 555');
    expect(maskPhone('8095550')).toBe('(809) 555-0');
    expect(maskPhone('8095550100')).toBe('(809) 555-0100');
  });

  it('keeps only digits, so a pasted number reformats', () => {
    expect(maskPhone('(809) 555-0100')).toBe('(809) 555-0100');
    // A real stored number, punctuated the old way, lands in the mask unchanged digit-for-digit.
    expect(maskPhone('809-555-0100')).toBe('(809) 555-0100');
    expect(maskPhone('abc809def555')).toBe('(809) 555');
  });

  it('stops at ten digits however many are given', () => {
    expect(maskPhone('809555010099999')).toBe('(809) 555-0100');
    // A pasted country code is just more digits: "+1" shifts everything and the tail is cut.
    expect(maskPhone('+1 809-555-0100')).toBe('(180) 955-5010');
  });

  it('re-formats after a digit is deleted', () => {
    expect(maskPhone('(809) 555-010')).toBe('(809) 555-010');
    expect(maskPhone('(809) 5')).toBe('(809) 5');
  });
});

describe('isCompletePhone', () => {
  it('accepts only a full ten-digit number', () => {
    expect(isCompletePhone('(809) 555-0100')).toBe(true);
    expect(isCompletePhone('(809) 555-010')).toBe(false);
    expect(isCompletePhone('')).toBe(false);
  });
});
