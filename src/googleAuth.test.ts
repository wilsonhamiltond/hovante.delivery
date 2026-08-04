import { Platform } from 'react-native';
import {
  GOOGLE_REDIRECT_URI,
  GOOGLE_RETURN_TARGET,
  GOOGLE_START_URL,
  parseGoogleReturnUrl,
} from './googleAuth';

// Google now runs the same browser flow as Facebook, so its return link is the same contract and
// deserves the same pinning: the app must find the JWT on success and the message on failure.
describe('google auth return link', () => {
  it('starts the flow on the API with the return target for this platform', () => {
    expect(GOOGLE_START_URL).toContain('/auth/google/start');
    expect(GOOGLE_RETURN_TARGET).toBe(Platform.OS === 'web' ? 'web' : 'app');
    expect(GOOGLE_START_URL).toContain(`return=${GOOGLE_RETURN_TARGET}`);
  });

  it('waits on its own deep link, separate from the Facebook one', () => {
    if (Platform.OS === 'web') {
      expect(GOOGLE_REDIRECT_URI).toContain('/google-auth');
    } else {
      expect(GOOGLE_REDIRECT_URI).toBe('hovantedelivery://google-auth');
    }
  });

  it('reads the token off a success return', () => {
    expect(parseGoogleReturnUrl(`${GOOGLE_REDIRECT_URI}?token=header.payload.signature`))
      .toEqual({ token: 'header.payload.signature' });
  });

  it('decodes the error message off a failure return', () => {
    const res = parseGoogleReturnUrl(
      `${GOOGLE_REDIRECT_URI}?error=Inicio%20de%20sesi%C3%B3n%20con%20Google%20cancelado.`,
    );
    expect(res.token).toBeUndefined();
    expect(res.error).toBe('Inicio de sesión con Google cancelado.');
  });

  it('ignores anything else on the link', () => {
    expect(parseGoogleReturnUrl(`${GOOGLE_REDIRECT_URI}?scope=email&token=jwt&authuser=0#frag`))
      .toEqual({ token: 'jwt' });
  });

  it('returns nothing for a link with no usable query', () => {
    expect(parseGoogleReturnUrl(GOOGLE_REDIRECT_URI)).toEqual({});
    expect(parseGoogleReturnUrl(`${GOOGLE_REDIRECT_URI}?token=`)).toEqual({});
  });
});
