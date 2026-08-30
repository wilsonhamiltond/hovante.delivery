import { isProfileComplete, type Me } from './api';
import { isCompletePhone, maskPhone, parsePhone, splitDisplayName, toE164 } from './profileForm';

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
  // The default account is an email sign-up, so it has a password of its own; the social-only case
  // overrides this.
  hasPassword: true,
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

  // Apple only sends the name on the first authorisation, so a returning Sign in with Apple
  // account may hold a single-word name forever. It must count as complete -- requiring a surname
  // would trap it in the form re-asking for what Apple provided (App Review guideline 4).
  it('accepts a single-word name with no surname', () => {
    expect(isProfileComplete(account({ lastName: null }))).toBe(true);
  });

  it.each(['name', 'phone', 'address'] as const)('rejects a missing %s', (field) => {
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

// The phone field is country-aware now: libphonenumber-js decides how each country groups its
// digits and what counts as a whole number. These pin the behaviour the screens rely on -- the
// exact separators are the library's business, not ours to re-specify.
describe('maskPhone', () => {
  it('formats progressively as digits are typed', () => {
    expect(maskPhone('')).toBe('');
    // No dangling open bracket: the group closes only once its three digits are there.
    expect(maskPhone('8')).toBe('8');
    expect(maskPhone('809')).toBe('(809)');
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

  it('stops at E.164 length, the only universal ceiling', () => {
    // 15 digits is the most any number can have. Beyond it the extra keystrokes are dropped rather
    // than accumulating into something no country could format.
    expect(maskPhone('8095550100999999999').replace(/\D/g, '')).toHaveLength(15);
  });

  it('formats each country in its own convention', () => {
    expect(maskPhone('612345678', 'ES')).toBe('612 34 56 78');
    expect(maskPhone('2015550123', 'US')).toBe('(201) 555-0123');
    expect(maskPhone('8095550100', 'DO')).toBe('(809) 555-0100');
  });

  it('re-formats after a digit is deleted', () => {
    expect(maskPhone('(809) 555-010')).toBe('(809) 555-010');
    expect(maskPhone('(809) 5')).toBe('(809) 5');
  });
});

// Validity is per country: the same ten digits are a whole number in one place and nonsense in
// another, which is the entire reason the picker exists.
describe('isCompletePhone', () => {
  it('accepts a whole number for its own country', () => {
    expect(isCompletePhone('(809) 555-0100', 'DO')).toBe(true);
    expect(isCompletePhone('612 34 56 78', 'ES')).toBe(true);
  });

  it('rejects a half-typed one', () => {
    expect(isCompletePhone('(809) 555', 'DO')).toBe(false);
    expect(isCompletePhone('', 'DO')).toBe(false);
  });

  it('judges the same digits differently per country', () => {
    // Nine digits: a complete Spanish mobile, not a complete Dominican number.
    expect(isCompletePhone('612345678', 'ES')).toBe(true);
    expect(isCompletePhone('612345678', 'DO')).toBe(false);
  });
});

describe('toE164', () => {
  it('stores the unambiguous international form', () => {
    expect(toE164('(809) 555-0100', 'DO')).toBe('+18095550100');
    expect(toE164('612 34 56 78', 'ES')).toBe('+34612345678');
  });

  it('gives nothing back for a number that is not usable', () => {
    expect(toE164('(809) 555', 'DO')).toBe('');
    expect(toE164('', 'DO')).toBe('');
  });
});

// Editing has to reopen an existing number on the right flag -- including the bare Dominican ones
// stored before the country picker existed.
describe('parsePhone', () => {
  it('splits a stored E.164 number', () => {
    expect(parsePhone('+34612345678')).toEqual({ country: 'ES', national: '612 34 56 78' });
  });

  it('reads a legacy Dominican number as Dominican', () => {
    expect(parsePhone('(809) 555-0100')).toEqual({ country: 'DO', national: '(809) 555-0100' });
  });

  it('is empty for no number at all', () => {
    expect(parsePhone(null)).toEqual({ country: 'DO', national: '' });
  });
});
