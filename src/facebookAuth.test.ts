import { Platform } from 'react-native';
import {
  FACEBOOK_REDIRECT_URI,
  FACEBOOK_RETURN_TARGET,
  FACEBOOK_START_URL,
  parseFacebookReturnUrl,
} from './facebookAuth';

// The deep link the API's callback builds is the entire contract between the two sides, so pin it:
// the app must find the JWT on a success return and the message on every failure return.
describe('facebook auth return link', () => {
  it('starts the flow on the API with the return target for this platform', () => {
    expect(FACEBOOK_START_URL).toContain('/auth/facebook/start');
    expect(FACEBOOK_RETURN_TARGET).toBe(Platform.OS === 'web' ? 'web' : 'app');
    expect(FACEBOOK_START_URL).toContain(`return=${FACEBOOK_RETURN_TARGET}`);
  });

  it('waits on the deep link from app.json scheme, or its own page on web', () => {
    if (Platform.OS === 'web') {
      // Same origin as the app: an auth-session popup only completes where it started.
      expect(FACEBOOK_REDIRECT_URI).toContain('/facebook-auth');
    } else {
      expect(FACEBOOK_REDIRECT_URI).toBe('hovantedelivery://facebook-auth');
    }
  });

  it('reads the token off a success return', () => {
    const res = parseFacebookReturnUrl(`${FACEBOOK_REDIRECT_URI}?token=header.payload.signature`);
    expect(res).toEqual({ token: 'header.payload.signature' });
  });

  it('decodes the error message off a failure return', () => {
    const res = parseFacebookReturnUrl(
      `${FACEBOOK_REDIRECT_URI}?error=Inicio%20de%20sesi%C3%B3n%20cancelado.`,
    );
    expect(res.token).toBeUndefined();
    expect(res.error).toBe('Inicio de sesión cancelado.');
  });

  it('ignores anything else on the link', () => {
    const res = parseFacebookReturnUrl(`${FACEBOOK_REDIRECT_URI}?state=abc&token=jwt&next=/home#frag`);
    expect(res).toEqual({ token: 'jwt' });
  });

  it('returns nothing for a link with no query at all', () => {
    expect(parseFacebookReturnUrl(FACEBOOK_REDIRECT_URI)).toEqual({});
    expect(parseFacebookReturnUrl(`${FACEBOOK_REDIRECT_URI}?token=`)).toEqual({});
  });
});
