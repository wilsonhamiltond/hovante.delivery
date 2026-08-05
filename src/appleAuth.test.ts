import { Platform } from 'react-native';
import {
  APPLE_REDIRECT_URI,
  APPLE_RETURN_TARGET,
  APPLE_START_URL,
  parseAppleReturnUrl,
} from './appleAuth';

// Apple runs the same browser flow as Google and Facebook, so its return link is the same contract
// and gets the same pinning: the JWT on success, the message on failure.
describe('apple auth return link', () => {
  it('starts the flow on the API with the return target for this platform', () => {
    expect(APPLE_START_URL).toContain('/auth/apple/start');
    expect(APPLE_RETURN_TARGET).toBe(Platform.OS === 'web' ? 'web' : 'app');
    expect(APPLE_START_URL).toContain(`return=${APPLE_RETURN_TARGET}`);
  });

  it('waits on its own deep link, separate from the other providers', () => {
    if (Platform.OS === 'web') {
      expect(APPLE_REDIRECT_URI).toContain('/apple-auth');
    } else {
      expect(APPLE_REDIRECT_URI).toBe('hovantedelivery://apple-auth');
    }
  });

  it('reads the token off a success return', () => {
    expect(parseAppleReturnUrl(`${APPLE_REDIRECT_URI}?token=header.payload.signature`))
      .toEqual({ token: 'header.payload.signature' });
  });

  it('decodes the error message off a failure return', () => {
    const res = parseAppleReturnUrl(
      `${APPLE_REDIRECT_URI}?error=Inicio%20de%20sesi%C3%B3n%20con%20Apple%20cancelado.`,
    );
    expect(res.token).toBeUndefined();
    expect(res.error).toBe('Inicio de sesión con Apple cancelado.');
  });

  it('ignores anything else on the link', () => {
    expect(parseAppleReturnUrl(`${APPLE_REDIRECT_URI}?state=abc&token=jwt&user=%7B%7D#frag`))
      .toEqual({ token: 'jwt' });
  });

  it('returns nothing for a link with no usable query', () => {
    expect(parseAppleReturnUrl(APPLE_REDIRECT_URI)).toEqual({});
    expect(parseAppleReturnUrl(`${APPLE_REDIRECT_URI}?token=`)).toEqual({});
  });
});
