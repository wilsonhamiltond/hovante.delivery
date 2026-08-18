import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/auth';
import * as api from '../src/api';
import type { Me } from '../src/api';
import { ExploreHome } from '../src/ExploreHome';
import { LogoSplash } from '../src/LogoSplash';

// The "Explorar" tab: the full marketplace -- category row and product catalogue. It loads the
// profile the same way /home does, since each tab is its own screen and neither can read the
// other's state.
//
// Clients only, matching the tab bar: the driver variant has no Explorar entry, so a driver can
// only arrive here by deep link, and is sent to their own home instead of a marketplace they
// cannot order from.
export default function ExploreScreen() {
  const { token } = useAuth();
  const router = useRouter();
  // ?q= arrives when the home screen's search box was submitted, ?companyId=/?companyName= when a
  // merchant was tapped in its carousel -- either way this tab opens already filtered.
  const { q, companyId, companyName } = useLocalSearchParams<{
    q?: string;
    companyId?: string;
    companyName?: string;
  }>();
  // An id is what the catalogue actually filters by, so a merchant with neither is no filter at all.
  const company = companyId && companyName ? { id: companyId, name: companyName } : null;
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped to ask for the profile again after a failed attempt; see the retry effect below.
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      if (!token) return;
      const res = await api.me();
      if (!active) return;
      if (!res.success) return;
      setProfile(res.data);
    })().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, attempt]));

  // Same quiet retry as /home: a 401 has already ended the session by the time the request comes
  // back, so anything still failing here is the connection, and it is worth waiting out behind the
  // splash rather than reporting.
  useEffect(() => {
    if (loading || profile || !token) return;
    const id = setTimeout(() => setAttempt((n) => n + 1), 4000);
    return () => clearTimeout(id);
  }, [loading, profile, token, attempt]);

  useEffect(() => {
    if (profile?.isDriver) router.replace('/home');
  }, [profile?.isDriver]);

  if (loading || profile?.isDriver) return <LogoSplash />;

  if (profile) return <ExploreHome profile={profile} initialSearch={q} initialCompany={company} />;

  // No profile yet: an expired session is already on its way to /login and a failed request is
  // being retried above, so there is nothing to ask of the user -- just the logo until one of the
  // two resolves.
  return <LogoSplash />;
}
