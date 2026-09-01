import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { pointInPolygon } from './geo';
import { strings, type Locale } from './i18n';

// Only the fallback error messages a screen shows to the user live here -- headers, URLs and
// payload fields are protocol, not text. Read through strings() at call time so a language
// switch is picked up by the next request.
const S: Record<
  Locale,
  {
    networkError: string;
    serverError: (status: number) => string;
    noSession: string;
    sessionExpired: string;
  }
> = {
  es: {
    networkError: 'No se pudo conectar con el servidor.',
    serverError: (status) => `Error del servidor (${status}).`,
    noSession: 'Sesión no iniciada.',
    sessionExpired: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  },
  en: {
    networkError: 'Could not connect to the server.',
    serverError: (status) => `Server error (${status}).`,
    noSession: 'You are not signed in.',
    sessionExpired: 'Your session expired. Please sign in again.',
  },
  fr: {
    networkError: 'Impossible de se connecter au serveur.',
    serverError: (status) => `Erreur du serveur (${status}).`,
    noSession: 'Vous n’êtes pas connecté.',
    sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
  },
};

// Puts a picked image into a FormData as an actual FILE, on both hosts.
//
// React Native's FormData accepts a { uri, type, name } stand-in and turns it into a file part.
// The browser's does NOT: it stringifies the object, so the request arrives carrying a text field
// called "file" holding "[object Object]", ASP.NET cannot bind it to IFormFile, and the upload
// fails with a 400 that says nothing. On web the uri (a blob:/data: URL) has to be read back into
// a real Blob first.
async function appendImage(
  form: FormData, uri: string, mimeType: string, fileName: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, fileName);
    return;
  }
  // The cast is because the DOM typings describe Blob | string and know nothing about this shape.
  form.append('file', { uri, type: mimeType, name: fileName } as unknown as Blob);
}

// The API wraps every response in { success, message, data }.
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// The token the client sends. Held here, not in React state, so sliding refresh can update it on
// every response without re-rendering the app -- setting React state on each request caused an
// effect/refetch loop. React state only tracks logged-in-or-not; this holds *which* token to send.
let currentToken: string | null = null;
export function setAuthToken(token: string | null) {
  currentToken = token;
  // An identity request in flight belongs to the previous credential; coalescing onto it would
  // hand the new session the old session's answer.
  meInFlight = null;
}

// Sliding-session refresh (8.5.1): every authenticated response carries a fresh access token in the
// x-new-access-token header (TokenRefreshMiddleware). We adopt it for subsequent requests and hand
// it to the persist handler, so the session rolls forward with no separate refresh call and no
// re-render churn.
let onTokenRotated: ((token: string) => void) | null = null;
export function setTokenRotationHandler(fn: (token: string) => void) {
  onTokenRotated = fn;
}

function captureRotatedToken(res: Response) {
  const rotated = res.headers.get('x-new-access-token');
  if (rotated) {
    currentToken = rotated;
    onTokenRotated?.(rotated);
  }
}

// A 401 on an authenticated call means the held session is no longer good -- expired, or revoked
// server-side. No screen can do anything about that, so rather than each one rendering its own
// failure the client drops the token and tells the app the session is over; the gate in _layout
// then sends the user back to the welcome screen, which is the only thing that can fix it.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

// The Spanish (source-language) text, kept as a stable constant for callers and tests that
// compare against it; the responses below carry the localized reading of the same message.
export const SESSION_EXPIRED = S.es.sessionExpired;

// Checked before the body is parsed, because an expired token comes back as a bare 401 with no
// { success, message } envelope -- which is what used to surface as "Error del servidor (401)".
// Only a 401 on a request that CARRIED a token ends the session: a guest (no token held) reaching
// an account-only endpoint gets the same status, and there is no session to end for them.
function sessionExpired(res: Response): boolean {
  if (res.status !== 401 || !currentToken) return false;
  currentToken = null;
  onUnauthorized?.();
  return true;
}

// The signed-in account (GET /auth/me). The JWT carries no role, so the app asks.
export interface Me {
  email: string;
  name: string | null;
  // Surname from the sign-up wizard; combined with name for the full display name.
  lastName: string | null;
  // Contact phone from the sign-up wizard; null when none was given.
  phone: string | null;
  document: string | null;
  isClient: boolean;
  isDriver: boolean;
  // True for a merchant-company (ERP) account signed into the app: it gets the orders screen
  // instead of the marketplace. Optional so an older API simply reads as "not a merchant".
  isMerchant?: boolean;
  merchantCompanyName?: string | null;
  address: string | null;
  // What the customer calls their default address ("Casa", "Trabajo"). Null with no saved address.
  addressLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  // False for an account created purely through Google, Facebook or Apple: there is no password its
  // owner ever chose, so "cambiar contraseña" has nothing to change. Becomes true if they set one
  // through the recovery flow.
  //
  // Optional because an API older than this field simply omits it. Read it as "hide only when the
  // server says false" -- treating a missing field as false hides the button from everyone the
  // moment the app is newer than the server, which is exactly what happened once already.
  hasPassword?: boolean;
  // Public URL of the profile picture, or null when none has been set. The API rebuilds it from the
  // stored key, so the app never needs to know which bucket or CDN serves it.
  imageUrl?: string | null;
}

// One stop on a driver's route (GET /delivery/mine).
export interface Delivery {
  id: string;
  deliveryNumber: string | null;
  status: string;
  scheduledDate: string | null;
  sequence: number;
  recipientName: string | null;
  addressLine: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  clientPhone: string | null;
  pickupName: string | null;
  pickupAddress: string | null;
  // The merchant's office phone -- who the courier calls on arrival.
  pickupPhone: string | null;
  // The merchant's pin, when its office has been geocoded. Null falls back to geocoding the
  // address, which is what every pickup did before offices carried coordinates.
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  notes: string | null;
  receiverName: string | null;
  failureReason: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  // The linked order's amounts (products + delivery charge, separately), so the driver sees what
  // to collect at the door. Null on deliveries without a marketplace order behind them.
  orderTotal?: number | null;
  orderDeliveryFee?: number | null;
  // The first product's photo (public URL), worn by the delivery's pin on the pool map.
  orderImageUrl?: string | null;
  // The other two faces the map pins wear: the merchant's logo on the office the order is
  // collected from, and the customer's own picture on the door it goes to. Null when the company
  // has no logo or the customer never set a photo, and the pin keeps its numbered teardrop.
  pickupImageUrl?: string | null;
  customerImageUrl?: string | null;
  // The order's lines -- what is actually in the bag. Empty on deliveries with no marketplace order
  // behind them, for the same reason the two amounts above are null there.
  orderItems?: DeliveryOrderItem[];
}

export interface DeliveryOrderItem {
  id: string;
  itemId: string;
  name: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// A business category (the company business type) from the ERP catalog. Drives the category row
// on the client home.
export interface BusinessCategory {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  // Split out of the wizard's single "Nombre y apellido" field. The API stores the two separately,
  // and only the app decides how many boxes to ask for them in.
  lastName?: string;
  phone: string;
  // Optional: onboarding no longer asks for a document.
  document?: string;
  type: 'client' | 'driver';
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  // What the customer calls this address ("Casa", "Trabajo"). Optional: the saved address falls
  // back to "Principal".
  addressLabel?: string;
}

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch only rejects on a network-level failure (server down, CORS, no connection).
    return { success: false, message: strings(S).networkError, data: null as T };
  }

  // 4xx/5xx still carry the { success, message } envelope, so parse before deciding.
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as T };
}

// Sign in with Apple, NATIVE flow: the system sheet (expo-apple-authentication) already proved who
// the person is and handed back an identity token; the API verifies it against Apple's keys and
// returns our JWT as `data`. `name` is the sheet's full name, which Apple only supplies the first
// time this person authorises the app -- omit it when the credential carries none.
export function loginWithAppleNative(identityToken: string, name?: string) {
  return post<string>('/auth/apple', { identityToken, name });
}

// Both endpoints return the JWT as `data` on success.
export function login(email: string, password: string) {
  return post<string>('/auth/login', { email, password });
}

export function register(payload: RegisterPayload) {
  return post<string>('/auth/register', payload);
}

// Google and Facebook sign-in have no client function here: both are browser flows, so the app
// opens the API's /auth/<provider>/start and the JWT comes back on the return link rather than in
// a response body (see googleAuth.ts / facebookAuth.ts). The API keeps its POST /auth/google for a
// native build that can obtain an ID token on-device; nothing in this app calls it today.

// Sign-up email verification. Step 1 mails a 6-digit code to the address; step 2 checks it. The
// server refuses to register an address that has not been verified this way.
export function sendEmailCode(email: string) {
  return post<null>('/auth/send-email-code', { email });
}

export function verifyEmailCode(email: string, code: string) {
  return post<null>('/auth/verify-email-code', { email, code });
}

// Password reset. forgotPassword always reports success (the server does not reveal whether the
// email exists); a real account is emailed a reset link. resetPassword consumes the link's token.
export function forgotPassword(email: string) {
  return post<null>('/auth/forgot-password', { email });
}

export function resetPassword(token: string, newPassword: string) {
  return post<null>('/auth/reset-password', { token, newPassword });
}

// The typed path to the same endpoint: the 6-digit code from the reset email plus the address it
// went to. Used when the person came here by requesting a code (so the app knows the email); the
// deep link keeps using the token above.
export function resetPasswordWithCode(email: string, code: string, newPassword: string) {
  return post<null>('/auth/reset-password', { email, code, newPassword });
}

// Changing the password from inside the app, where the account is already signed in. The current
// password is required and checked server-side -- the token alone is not treated as proof here,
// because it lives on the phone and outlives any one session.
// Deletes the signed-in account (App Store 5.1.1(v): an account created in the app must be
// deletable in the app). The server erases the personal data and disables the login; the screen
// then signs out locally. The bearer token is the proof of identity -- a social account has no
// password to re-ask for, so the screen carries its own explicit confirmation instead.
export function deleteAccount() {
  return postAuth<string>('/auth/delete-account', {});
}

export function changePassword(currentPassword: string, password: string) {
  return postAuth<string>('/auth/change-password', {
    currentPassword,
    password,
    // The endpoint checks the two match; sending the same value keeps that check satisfied while
    // the screen does its own confirm-field comparison with a message written for this app.
    passwordConfirm: password,
  });
}

// GET, with the held token when there is one (set on login/restore, updated by sliding refresh).
// Sent without one too: guests browse the marketplace before signing in, and the browse endpoints
// accept anonymous calls. An account-only endpoint answers a guest with a 401, which comes back as
// a plain failure rather than ending a session that does not exist.
async function get<T>(path: string): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : undefined,
    });
  } catch {
    return { success: false, message: strings(S).networkError, data: null as T };
  }
  captureRotatedToken(res);
  if (sessionExpired(res)) return { success: false, message: strings(S).sessionExpired, data: null as T };
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as T };
}

// The last profile fetched, kept so a screen can know the signed-in role synchronously.
// The bottom bar's tabs differ per role and every screen refetches me() on focus, so a screen
// that reads the role from request state alone renders the client bar for the length of that
// request and then snaps to the merchant/driver one -- visible every time the tab is opened.
let lastMe: Me | null = null;

export function cachedMe(): Me | null {
  return lastMe;
}

// Must be called on sign-out: otherwise the next account to sign in briefly gets the previous
// one's tab bar, which for a client landing on a merchant's bar is a link to screens they
// cannot open.
export function clearCachedMe() {
  lastMe = null;
}

// One identity request at a time: at startup the token-restore check and the home screen both ask
// "who am I" within the same tick, and each used to go to the network separately. Concurrent
// callers now share the same request; SEQUENTIAL callers still refetch, so a screen regaining
// focus keeps seeing fresh data (and the tests pinning retry-after-401 and refetch-failure
// behavior keep holding).
let meInFlight: Promise<ApiResponse<Me>> | null = null;

export function me(): Promise<ApiResponse<Me>> {
  if (meInFlight) return meInFlight;
  meInFlight = (async () => {
    try {
      const res = await get<Me>('/auth/me');
      if (res.success && res.data) lastMe = res.data;
      return res;
    } finally {
      meInFlight = null;
    }
  })();
  return meInFlight;
}

// What a social sign-in (Facebook/Google) could not supply. The provider proves the email and is
// the credential, so there is no code to verify and no password to choose -- only the wizard's
// person-info and location steps are left.
export interface CompleteProfilePayload {
  name: string;
  lastName: string;
  phone: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  addressLabel?: string;
}

export function completeProfile(payload: CompleteProfilePayload) {
  return postAuth<string>('/auth/complete-profile', payload);
}

// Editing the account's own details from the "Mi cuenta" screen. Narrower than completeProfile on
// purpose: no email (it identifies the account) and no address (the address book owns those).
export function updateProfile(payload: { name: string; lastName: string; phone: string }) {
  return postAuth<string>('/auth/update-profile', payload);
}

// Profile picture upload. Multipart rather than JSON, so it cannot go through postAuth: the body is
// a FormData and the Content-Type header must be left unset for fetch to add the multipart boundary
// itself. Returns the stored image's public URL as `data`.
export async function uploadProfileImage(uri: string, mimeType: string, fileName: string): Promise<ApiResponse<string>> {
  if (!currentToken) return { success: false, message: strings(S).noSession, data: null as unknown as string };

  const form = new FormData();
  await appendImage(form, uri, mimeType, fileName);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/profile-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      body: form,
    });
  } catch {
    return { success: false, message: strings(S).networkError, data: null as unknown as string };
  }
  captureRotatedToken(res);
  if (sessionExpired(res)) {
    return { success: false, message: strings(S).sessionExpired, data: null as unknown as string };
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<string> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as unknown as string };
}

// Whether an account still owes us the sign-up details. A social account is minted with just the
// provider's email and display name, so it lands here missing everything else. Mirrors exactly what
// CompleteProfileAsync refuses to save without, so the app never routes someone to a form the
// server would reject, nor holds back one it would accept.
export function isProfileComplete(profile: Me | null): boolean {
  if (!profile) return false;
  // A merchant is an ERP account: the sign-up wizard's person fields do not define it, and most
  // merchants have no delivery-side contact to carry them. Treating one as incomplete quietly
  // broke everything gated on profileComplete -- notification taps most visibly, which were
  // dropped on the way to /merchant-order because the gate never released.
  if (profile.isMerchant) return true;
  const filled = (value: string | null) => typeof value === 'string' && value.trim().length > 0;
  // No lastName here: Apple only reports the name on the first authorisation, so a returning
  // Sign in with Apple account may hold a single-word name forever. Requiring a surname would
  // trap it in the completion form asking for what Apple already provided (guideline 4).
  return filled(profile.name) && filled(profile.phone) && filled(profile.address);
}

// The business categories shown as the home category row. The marketplace discovery endpoint, not
// the ERP's /businessCategory catalogue: it returns only categories that an active company with
// delivery enabled belongs to, so the row never offers one that opens on an empty merchant list.
export function businessCategories() {
  return get<BusinessCategory[]>('/public/company-categories');
}

// A live price offer, for the home screen's "Últimas ofertas" carousel. The API sends both prices
// and the whole-percent badge, so the app never recomputes a discount the server already decided.
export interface OfferItem {
  /** The offer's own id. */
  id: string;
  /** The discounted item -- this is what goes in a cart, not the offer id. */
  itemId: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  /** The item's photo as a URL (imagePath is only the storage key). Null when it has none. */
  imageUrl?: string | null;
  /** The normal price, for the struck-through "before". */
  price: number;
  offerPrice: number;
  discountPercent: number;
  companyId: string | null;
  companyName: string | null;
  itemTypeName: string | null;
  /** Units left at the offer price, or null when the offer is unlimited. */
  remainingQuantity: number | null;
  startsAt: string;
  endsAt: string | null;
}

// The offers running right now, newest first. Not tenant-scoped: a customer shops every merchant.
// The point is where the customer would have it delivered (selected address / current location):
// with it, quadrant-restricted merchants' offers only show when the point is inside a quadrant.
export function latestOffers(limit = 10, latitude?: number | null, longitude?: number | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (latitude != null && longitude != null) {
    params.set('latitude', String(latitude));
    params.set('longitude', String(longitude));
  }
  return get<OfferItem[]>(`/itemOffer/latest?${params.toString()}`);
}

// An entry in the home screen's "lo más pedido" carousel. This is the ERP's item shape, not the
// catalogue's Product: the endpoint serves DiscoveryItemDto (ItemDto + the merchant's name + the
// units sold), so the category arrives as a nested itemType rather than a `categories` array.
export interface TopItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
  /** The item's photo as a URL (imagePath is only the storage key). Null when it has none. */
  imageUrl?: string | null;
  companyId: string | null;
  companyName: string | null;
  /** The merchant's logo as a URL, for the "comercios más pedidos" cards. Null when none is set,
   *  and optional so an older API simply reads as "no logo". */
  companyLogoUrl?: string | null;
  /** Units sold in the last 7 days. Null outside the top-weekly endpoint. */
  orderedCount: number | null;
  itemType?: { name?: string | null } | null;
}

// The most-ordered items of the last 7 days, most popular first. Behind auth, unlike the identical
// /public/top-weekly the marketing site uses. Same optional delivery point as latestOffers.
export function topWeekly(limit = 10, latitude?: number | null, longitude?: number | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (latitude != null && longitude != null) {
    params.set('latitude', String(latitude));
    params.set('longitude', String(longitude));
  }
  return get<TopItem[]>(`/delivery/top-weekly?${params.toString()}`);
}

// A marketplace product (an item from any merchant company).
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
  // The photo as a URL the app can render directly (imagePath is only the storage key). Null when
  // the item has no photo; optional so an older API simply reads as "none".
  imageUrl?: string | null;
  companyId: string;
  companyName: string;
  // Whether the item is on sale. Always true in the marketplace, which lists nothing else; only the
  // merchant's own catalogue carries false. Optional so an older API simply reads as "on sale".
  active?: boolean;
  categories: string[];
  // The product category (item type) the row belongs to. Only the merchant's own catalogue fills
  // it -- the form preselects it when editing; optional so an older API simply reads as "unknown".
  itemTypeId?: string | null;
}

export interface OrderLineInput {
  itemId: string;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  merchantCompanyId: string;
  merchantName: string | null;
  // The merchant's logo (public URL), worn by the branch pin on the merchant's driver-approach
  // map. Null when the company never uploaded one.
  merchantImageUrl?: string | null;
  // Which of the merchant's branches fulfils the order; null when there was no choice to make.
  // The merchant's driver-approach map points at this branch's pin.
  officeId?: string | null;
  status: string;
  // "Retiro en tienda": the customer collects at the branch, no courier involved. The tracking
  // drops the driver stages and the merchant hands over against the code instead of waiting for
  // a rider. Optional-null: an older API simply never says it.
  pickupAtStore?: boolean;
  subtotal: number;
  total: number;
  notes: string | null;
  address: string | null;
  // The delivery pin snapshotted at checkout; null on orders placed before the location step.
  latitude: number | null;
  longitude: number | null;
  // The delivery charge the server computed when the order was placed, separate from total (which
  // stays products-only). Optional-null: an older API or a pre-tariff order simply has none, and
  // the screens then show the products total alone.
  deliveryFee?: number | null;
  deliveryDistanceM?: number | null;
  // Cash orders: the bill the customer said they would pay with; the change owed is this minus
  // (total + deliveryFee). Null/absent = exact payment or an older order.
  payWithAmount?: number | null;
  // Why the customer cancelled, when they did; shown back on the tracking screen.
  cancelReason?: string | null;
  // How many minutes the merchant said the order would queue before preparation starts, declared
  // when they confirmed -- and when that confirm happened, which the wait counts from (see
  // orderQueue.ts). Optional-null: an older API, an order confirmed from the web (which does not
  // ask), or one not yet confirmed simply has none.
  queueMinutes?: number | null;
  confirmedAt?: string | null;
  createdAt: string;
  items: { id: string; itemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
  // The fulfilling delivery's status (from /orders/mine), used to tell active orders from finished.
  deliveryStatus?: string | null;
  // Who to deliver to -- populated on the merchant view only (null in the customer's own list).
  customerName?: string | null;
  customerPhone?: string | null;
  // The customer's profile picture (public URL), so a pin on their door shows a face rather than a
  // number. Merchant view only, and null when they never set one.
  customerImageUrl?: string | null;
  // The invoice issued for the order (automatic on "listo", or "Facturar" on the web), merchant
  // view only. Null until then. The id is what the invoice view is fetched with.
  documentId?: string | null;
  documentNumber?: string | null;
  ncf?: string | null;
  // The driver who took the delivery (merchant view; null until one claims it).
  driverName?: string | null;
  driverPhone?: string | null;
  // The driver's last reported position and when it was reported, for the merchant's map.
  driverLatitude?: number | null;
  driverLongitude?: number | null;
  driverPositionAt?: string | null;
}

// One page of the catalog. The home grid pulls these as it scrolls rather than loading every
// product, so category and search are sent along too -- filtering client-side would only ever
// search the pages already fetched. A short page means fewer than `take` came back, i.e. the end.
export interface ProductPageQuery {
  companyId?: string;
  businessCategoryId?: string;
  search?: string;
  skip?: number;
  take?: number;
  // Where the order would be delivered. Merchants whose offices define a delivery quadrant only
  // appear when this point falls inside one; without it nothing is filtered by location.
  latitude?: number | null;
  longitude?: number | null;
}

export function products(query: ProductPageQuery = {}) {
  const params = new URLSearchParams();
  if (query.companyId) params.set('companyId', query.companyId);
  if (query.businessCategoryId) params.set('businessCategoryId', query.businessCategoryId);
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.latitude != null && query.longitude != null) {
    params.set('latitude', String(query.latitude));
    params.set('longitude', String(query.longitude));
  }
  params.set('skip', String(query.skip ?? 0));
  params.set('take', String(query.take ?? PRODUCT_PAGE_SIZE));
  return get<Product[]>(`/delivery/products?${params.toString()}`);
}

// How many products a page holds. Exported so the caller can tell a full page (there may be more)
// from a short one (that was the last).
export const PRODUCT_PAGE_SIZE = 10;

// A page of the merchant's OWN catalogue, by name, for their Productos tab. Single-tenant: the
// company comes from the token's claim, so nothing identifies it in the request. Unlike the
// marketplace read above it keeps items that are not on sale, flagged with active: false.
export function merchantProducts(skip: number, take: number, search?: string) {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) });
  // Matched server-side: the app holds only the pages it has scrolled to, so filtering here would
  // search the rows already on screen rather than the catalogue.
  if (search?.trim()) params.set('search', search.trim());
  return get<Product[]>(`/delivery/products/merchant?${params.toString()}`);
}

// What the merchant edits from the phone: what the product is called, costs, and whether it is on
// sale. SKUs, taxes, item types and stock stay with the ERP.
export interface MerchantProductInput {
  name: string;
  description?: string;
  price: number;
  active: boolean;
  // The product category picked on the form. Omitted keeps the current one on an edit, and on a
  // create the server falls back to what the catalogue already uses most.
  itemTypeId?: string;
}

export function createMerchantProduct(input: MerchantProductInput) {
  return postAuth<Product>('/delivery/products/merchant', input);
}

export function updateMerchantProduct(id: string, input: MerchantProductInput) {
  return putAuth<Product>(`/delivery/products/merchant/${id}`, input);
}

// The server retires (takes off sale) a product that already has orders instead of erasing it, and
// says so in the message -- so the caller shows the response's message rather than assuming.
export function deleteMerchantProduct(id: string) {
  return deleteAuth<boolean>(`/delivery/products/merchant/${id}`);
}

// The product's photo. Multipart rather than JSON, for the same reason as the profile picture: the
// body is a FormData and the Content-Type header must be left unset so fetch adds the multipart
// boundary itself. Returns the stored image's public URL as `data`.
export async function uploadProductImage(
  id: string, uri: string, mimeType: string, fileName: string,
): Promise<ApiResponse<string>> {
  if (!currentToken) return { success: false, message: strings(S).noSession, data: null as unknown as string };

  const form = new FormData();
  await appendImage(form, uri, mimeType, fileName);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/delivery/products/merchant/${id}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      body: form,
    });
  } catch {
    return { success: false, message: strings(S).networkError, data: null as unknown as string };
  }
  captureRotatedToken(res);
  if (sessionExpired(res)) {
    return { success: false, message: strings(S).sessionExpired, data: null as unknown as string };
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<string> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as unknown as string };
}

// A product category (item type) as the merchant's Categorías screen lists it: the global rows
// every merchant shares plus this company's own. Only `owned` rows are the company's to touch --
// the shared ones are shown read-only.
export interface MerchantCategory {
  id: string;
  name: string;
  imageUrl?: string | null;
  owned: boolean;
}

export const CATEGORY_PAGE_SIZE = 10;

// One page of categories, like the product list: the screen pulls `take` from `skip` and appends
// as it scrolls.
export function merchantCategories(skip: number, take: number) {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) });
  return get<MerchantCategory[]>(`/delivery/categories/merchant?${params.toString()}`);
}

// Name only: the image goes up afterwards through uploadCategoryImage, like a product's photo --
// a new category has no id to attach it to until it is saved.
export function createMerchantCategory(input: { name: string }) {
  return postAuth<MerchantCategory>('/delivery/categories/merchant', input);
}

// Renames one of the company's own categories; the shared global ones are refused by the server.
export function updateMerchantCategory(id: string, input: { name: string }) {
  return putAuth<MerchantCategory>(`/delivery/categories/merchant/${id}`, input);
}

// Deletes one of the company's own categories. The server retires (deactivates) one that products
// still use instead of erasing it, and says so in the message -- show the response's message.
export function deleteMerchantCategory(id: string) {
  return deleteAuth<boolean>(`/delivery/categories/merchant/${id}`);
}

// The category's image. Multipart for the same reason as the product's photo; returns the stored
// image's public URL as `data`.
export async function uploadCategoryImage(
  id: string, uri: string, mimeType: string, fileName: string,
): Promise<ApiResponse<string>> {
  if (!currentToken) return { success: false, message: strings(S).noSession, data: null as unknown as string };

  const form = new FormData();
  await appendImage(form, uri, mimeType, fileName);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/delivery/categories/merchant/${id}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      body: form,
    });
  } catch {
    return { success: false, message: strings(S).networkError, data: null as unknown as string };
  }
  captureRotatedToken(res);
  if (sessionExpired(res)) {
    return { success: false, message: strings(S).sessionExpired, data: null as unknown as string };
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<string> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as unknown as string };
}

// One locale's rendering of a product (en/fr); Spanish is the item's own name/description. The
// same shape goes both ways: the list returns saved rows, the save upserts one by its locale.
export interface ProductTranslation {
  locale: string;
  name: string;
  description?: string | null;
}

export function merchantProductTranslations(id: string) {
  return get<ProductTranslation[]>(`/delivery/products/merchant/${id}/translations`);
}

export function saveMerchantProductTranslation(id: string, input: ProductTranslation) {
  return putAuth<ProductTranslation>(`/delivery/products/merchant/${id}/translations`, input);
}

// One weekday's opening window of the merchant's business, times as "HH:mm". Days the business
// does not open are simply absent; the save replaces the whole week in one call.
export interface BusinessHour {
  // .NET's DayOfWeek convention: 0 = domingo .. 6 = sábado.
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export function merchantBusinessHours() {
  return get<BusinessHour[]>('/delivery/business-hours/merchant');
}

export function saveMerchantBusinessHours(hours: BusinessHour[]) {
  return putAuth<string>('/delivery/business-hours/merchant', hours);
}

// "Cerrado hoy": whether the merchant is exceptionally closed for the current day, with an
// optional note saying why. The flag expires with the day -- tomorrow the business reopens alone.
export interface MerchantClosure {
  closedToday: boolean;
  note?: string | null;
}

export function merchantClosure() {
  return get<MerchantClosure>('/delivery/business-closure/merchant');
}

export function saveMerchantClosure(input: MerchantClosure) {
  return putAuth<MerchantClosure>('/delivery/business-closure/merchant', input);
}

export interface CreateOrderInput {
  items: OrderLineInput[];
  notes?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  // Which branch fulfils the order. Only sent when the customer was asked to choose; the server
  // checks it belongs to the merchant and that its quadrant reaches the delivery point.
  officeId?: string;
  // The street-route distance (metres) the checkout measured office -> delivery point. The server
  // recomputes the fee from it with its own tariff, floored at the straight-line distance.
  deliveryDistanceM?: number;
  // How the order leaves the store: "pickup" makes it a retiro en tienda -- no fee, no courier,
  // handed over at the counter against the code. The server honours it now; paymentType is still
  // forward compatibility (cash is the only method that works today).
  deliveryMode?: 'delivery' | 'pickup';
  paymentType?: 'cash' | 'card';
  // Cash orders: the bill the customer will pay with, so the merchant/driver brings the change.
  // Omitted = exact payment. The server rejects a value below the order's total.
  cashPayWith?: number;
}

// Place an order. The server rejects lines from more than one merchant; the app blocks it too.
export function createOrder(input: CreateOrderInput) {
  return postAuth<Order>('/delivery/orders', input);
}

// What the edit screen sends to change a still-PENDING order: the replacement lines, plus the
// note and the cash bill (both overwrite what the order had). Address, branch and mode are
// immutable -- changing where an order goes is a cancel-and-reorder.
export interface UpdateOrderInput {
  items: OrderLineInput[];
  notes?: string;
  cashPayWith?: number;
}

// Modify one of the customer's own orders. The server refuses it once the merchant has confirmed,
// so the button only exists while the tracking still shows "esperando confirmación".
export function updateOrder(id: string, input: UpdateOrderInput) {
  return putAuth<Order>(`/delivery/orders/${id}`, input);
}

// The customer's ACTIVE orders; finished ones come from the paginated history below.
export function myOrders() {
  return get<Order[]>('/delivery/orders/mine');
}

// A page of finished orders (delivered/cancelled/failed), newest first, for infinite scroll.
export function myOrderHistory(skip: number, take: number) {
  return get<Order[]>(`/delivery/orders/history?skip=${skip}&take=${take}`);
}

// The merchant view (an ERP account signed into the app): the orders placed to their company, and
// the same accept/release/reject actions the web back office has. All scoped server-side by the
// token's company claim. With activeOnly, only the counter's queue -- the finished ones come from
// the paginated history below.
export function merchantOrders(activeOnly = false) {
  return get<Order[]>(`/delivery/orders/merchant${activeOnly ? '?activeOnly=true' : ''}`);
}

// A page of the merchant's finished orders, newest first, for infinite scroll.
export function merchantOrderHistory(skip: number, take: number) {
  return get<Order[]>(`/delivery/orders/merchant/history?skip=${skip}&take=${take}`);
}

// Confirm an order, declaring how many minutes it will queue before preparation starts. The queue
// time is optional server-side (the web confirms without asking), but the app's confirm flow
// always collects it in the modal first.
export function confirmMerchantOrder(id: string, queueMinutes?: number) {
  return postAuth<Order>(`/delivery/orders/${id}/confirm`,
    queueMinutes != null ? { queueMinutes } : {});
}

export function readyMerchantOrder(id: string) {
  return postAuth<Order>(`/delivery/orders/${id}/ready`, {});
}

// Reject an order, saying why (e.g. a product the store has run out of). The reason travels to the
// customer's tracking screen and their push notification; optional server-side for older clients.
export function rejectMerchantOrder(id: string, reason?: string, notes?: string) {
  return postAuth<Order>(`/delivery/orders/${id}/reject`,
    reason ? { reason, notes: notes || undefined } : {});
}

// The counter handing a pickup ("retiro en tienda") order to its customer: the code is what the
// customer shows from their tracking screen, and the server refuses the handover without it.
export function deliverMerchantOrder(id: string, code: string) {
  return postAuth<Order>(`/delivery/orders/${id}/deliver`, { code });
}

// The invoice issued for one of the merchant's orders, shaped for display and printing: company
// header, fiscal identifiers, customer, lines and totals in one payload. Fails while the order
// has no invoice yet.
export interface OrderInvoiceLine {
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
  total: number;
}

export interface OrderInvoiceTax {
  name: string | null;
  rate: number;
  amount: number;
  // A retention subtracts from the total; shown negative.
  isRetention: boolean;
}

export interface OrderInvoice {
  orderId: string;
  orderNumber: string;
  documentId: string;
  companyName: string | null;
  companyRnc: string | null;
  companyLogoUrl: string | null;
  documentTypeName: string | null;
  docNumber: string | null;
  ncf: string | null;
  ncfTypeName: string | null;
  issueDate: string;
  dueDate: string | null;
  customerName: string | null;
  customerDocument: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  // The customer's account email -- where the server mails the invoice automatically when the
  // order is delivered. Null when the account has none (nothing is sent).
  customerEmail: string | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  notes: string | null;
  items: OrderInvoiceLine[];
  taxes: OrderInvoiceTax[];
}

export function merchantOrderInvoice(id: string) {
  return get<OrderInvoice>(`/delivery/orders/${id}/invoice`);
}

// One-tap "Facturar" with the company's defaults (same document type and office the automatic
// invoice at "listo" resolves), for a delivered order that was never invoiced -- auto-invoicing
// failed at "listo", or the order predates it. The server refuses double-invoicing.
export function autoInvoiceMerchantOrder(id: string) {
  return postAuth<{ orderId: string; documentId: string; documentNumber: string | null; ncf: string | null }>(
    `/delivery/orders/${id}/invoice/auto`, {});
}

// --- The merchant's fleet ("Repartidores") and delivery settings --------------------------------
//
// A merchant links drivers to its company. A linked driver only sees that fleet's deliveries; a
// driver with no fleet works the public pool -- merchants whose allowPublicOrders flag is on.

export interface MerchantDriver {
  driverUserId: string;
  name: string | null;
  phone: string | null;
  document: string | null;
  // The driver's login email -- searchable and shown on the card, since it is often the one
  // thing the merchant actually knows about them.
  email: string | null;
  // In search results: already on this merchant's team. The linked list is all true.
  linked: boolean;
}

export interface MerchantDeliverySettings {
  allowPublicOrders: boolean;
}

export function merchantDeliverySettings() {
  return get<MerchantDeliverySettings>('/delivery/merchant-settings');
}

export function saveMerchantDeliverySettings(input: MerchantDeliverySettings) {
  return putAuth<MerchantDeliverySettings>('/delivery/merchant-settings', input);
}

export function merchantDrivers() {
  return get<MerchantDriver[]>('/delivery/merchant-drivers');
}

export function searchMerchantDrivers(q: string) {
  return get<MerchantDriver[]>(`/delivery/merchant-drivers/search?q=${encodeURIComponent(q)}`);
}

export function linkMerchantDriver(driverUserId: string) {
  return postAuth<MerchantDriver>('/delivery/merchant-drivers', { driverUserId });
}

export function unlinkMerchantDriver(driverUserId: string) {
  return deleteAuth<boolean>(`/delivery/merchant-drivers/${driverUserId}`);
}

// Cancel one of the customer's own orders, saying why (the cancel screen collects the reason).
// The server refuses it once the merchant has confirmed, so the button only exists while the
// tracking still shows "esperando confirmación".
export function cancelOrder(id: string, reason: string, notes?: string) {
  return postAuth<Order>(`/delivery/orders/${id}/cancel`, { reason, notes: notes || undefined });
}

// An order plus its live delivery status, for the tracking screen.
export interface OrderTracking {
  order: Order;
  deliveryStatus: string | null;
  driverName: string | null;
  // The 4-digit code the customer reads to the driver to confirm delivery.
  deliveryCode: string | null;
  // When each status change happened (null until reached), aligned to the timeline steps.
  placedAt: string;
  confirmedAt: string | null;
  readyAt: string | null;
  assignedAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export function orderTracking(id: string) {
  return get<OrderTracking>(`/delivery/orders/${id}`);
}

// One entry in the customer's address list: a saved address, or one seen only on past orders.
export interface AddressHistory {
  // The saved address's id, for setting it as default. Null for an order-derived entry.
  id: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timesUsed: number;
  // Null for a saved address that has never been ordered to.
  lastUsedAt: string | null;
  // What the customer calls it. Null for an order-derived entry.
  label: string | null;
  // The one preselected at checkout.
  isDefault: boolean;
  // False for an entry that exists only in order history, not the address book.
  isSaved: boolean;
}

// The customer's addresses: the saved ones first (default first), then any address seen only on
// past orders.
// One of a merchant's branches at checkout: where it is, and the rectangle it delivers inside.
// The quadrant corners are all set or all null; null means this branch serves anywhere.
export interface MerchantOffice {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  minLatitude: number | null;
  maxLatitude: number | null;
  minLongitude: number | null;
  maxLongitude: number | null;
  // The exact delivery area as [lat, lng] vertices, when the merchant drew one. The rectangle
  // above is then its bounding box (kept for older apps); the polygon has the final word.
  // Optional-null: an older API, or an office with only the rectangle, simply has none.
  polygon?: [number, number][] | null;
}

export function merchantOffices(companyId: string) {
  return get<MerchantOffice[]>(`/delivery/companies/${companyId}/offices`);
}

// Whether a branch can take an order to a point: no area means anywhere; a polygon (when drawn)
// is the exact test; otherwise the rectangle. Inclusive on every edge, matching the server
// (DeliveryAreas.OfficeCovers) and the map picker -- if they disagreed, the app could offer a
// branch the server then refuses.
export function officeCovers(o: MerchantOffice, lat: number | null, lng: number | null): boolean {
  if (o.polygon && o.polygon.length >= 3) {
    if (lat == null || lng == null) return false;
    return pointInPolygon(o.polygon, lat, lng);
  }
  if (o.minLatitude == null || o.maxLatitude == null
      || o.minLongitude == null || o.maxLongitude == null) return true;
  if (lat == null || lng == null) return false;
  return lat >= o.minLatitude && lat <= o.maxLatitude
    && lng >= o.minLongitude && lng <= o.maxLongitude;
}

export function myAddresses() {
  return get<AddressHistory[]>('/delivery/my-addresses');
}

export interface SaveAddressPayload {
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  makeDefault?: boolean;
}

// Saves a new address to the signed-in customer's address book.
export function createMyAddress(payload: SaveAddressPayload) {
  return postAuth<AddressHistory>('/delivery/my-addresses', payload);
}

// Makes one of the customer's saved addresses the default.
export function setDefaultAddress(id: string) {
  return postAuth<AddressHistory>(`/delivery/my-addresses/${id}/default`, {});
}

// Rewrites one of the customer's saved addresses. Editing the default one also moves the contact's
// address snapshot, so checkout stops preselecting the text as it read before the edit.
export function updateMyAddress(id: string, payload: SaveAddressPayload) {
  return putAuth<AddressHistory>(`/delivery/my-addresses/${id}`, payload);
}

// Removes one of the customer's saved addresses. Deleting the default one promotes another, so the
// address book is never left without one.
export function deleteMyAddress(id: string) {
  return deleteAuth<boolean>(`/delivery/my-addresses/${id}`);
}

// Removes a past-order address (no saved row, so no id) from the list, identified by its text.
// The orders keep their snapshot; only the list forgets it.
export function hideMyAddress(address: string) {
  return postAuth<boolean>('/delivery/my-addresses/hide', { address });
}

// The courier's own vehicle ("Mi vehículo"). `data` is null when nothing has been saved yet, which
// is a success, not an error -- a new driver has no vehicle on record and the screen opens empty.
export interface Vehicle {
  id: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  plate: string | null;
}

export function myVehicle() {
  return get<Vehicle | null>('/delivery/my-vehicle');
}

// What the driver can change. Only `type` is required; the rest describe a vehicle already
// identified, and the API rejects a missing plate for anything that is not a bicycle.
export interface SaveVehiclePayload {
  type: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  plate?: string | null;
}

// Upsert: a courier has at most one vehicle, so there is no create-versus-update for the app to
// decide between -- PUT saves the first one and rewrites it afterwards.
export function saveMyVehicle(payload: SaveVehiclePayload) {
  return putAuth<Vehicle>('/delivery/my-vehicle', payload);
}

export function myDeliveries() {
  return get<Delivery[]>('/delivery/mine');
}

// The driver's finished deliveries (delivered/failed/returned/cancelled), newest first.
export function deliveryHistory() {
  return get<Delivery[]>('/delivery/history');
}

// The pickup pool: unassigned deliveries a driver can claim, and claiming one.
export function availableDeliveries() {
  return get<Delivery[]>('/delivery/available');
}

export function pickupDelivery(id: string) {
  return postAuth<Delivery>(`/delivery/${id}/pickup`, {});
}

// The driver's app reporting where they are; the server stamps it onto their active deliveries so
// the merchant's order view can show the position on a map. Fire-and-forget.
export function reportDriverPosition(latitude: number, longitude: number) {
  return postAuth<boolean>('/delivery/driver/position', { latitude, longitude });
}

// Push notification targets. The account is taken from the bearer token, so a device can only ever
// register itself to whoever is signed in on it.
export function registerDevice(token: string, platform: string) {
  return postAuth<boolean>('/notifications/register', { token, platform });
}

export function unregisterDevice(token: string) {
  return postAuth<boolean>('/notifications/unregister', { token });
}

// Authenticated POST for the driver's status actions. An optional idempotency key (8.5.9) lets a
// retried action -- e.g. the offline queue flushing something that actually went through -- be
// recognised by the server and not applied twice.
async function sendAuth<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, idempotencyKey?: string): Promise<ApiResponse<T>> {
  if (!currentToken) return { success: false, message: strings(S).noSession, data: null as T };
  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      // DELETE carries no body: some proxies drop one, and the id is already in the path.
      body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    return { success: false, message: strings(S).networkError, data: null as T };
  }
  captureRotatedToken(res);
  if (sessionExpired(res)) return { success: false, message: strings(S).sessionExpired, data: null as T };
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: strings(S).serverError(res.status), data: null as T };
}

function postAuth<T>(path: string, body: unknown, idempotencyKey?: string) {
  return sendAuth<T>('POST', path, body, idempotencyKey);
}

function putAuth<T>(path: string, body: unknown) {
  return sendAuth<T>('PUT', path, body);
}

function deleteAuth<T>(path: string) {
  return sendAuth<T>('DELETE', path, null);
}

export function startDelivery(id: string, idempotencyKey?: string) {
  return postAuth<Delivery>(`/delivery/${id}/start`, {}, idempotencyKey);
}

// The customer's 4-digit confirmation code, entered by the driver at the door. The server verifies
// it before completing the delivery.
export function deliverDelivery(id: string, code: string, idempotencyKey?: string) {
  return postAuth<Delivery>(`/delivery/${id}/deliver`, { code }, idempotencyKey);
}

export function failDelivery(id: string, reason: string, notes: string, idempotencyKey?: string) {
  return postAuth<Delivery>(`/delivery/${id}/fail`, { reason, notes }, idempotencyKey);
}
