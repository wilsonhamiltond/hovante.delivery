import { API_BASE_URL } from './config';

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
    return { success: false, message: 'No se pudo conectar con el servidor.', data: null as T };
  }

  // 4xx/5xx still carry the { success, message } envelope, so parse before deciding.
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: `Error del servidor (${res.status}).`, data: null as T };
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

// Changing the password from inside the app, where the account is already signed in. The current
// password is required and checked server-side -- the token alone is not treated as proof here,
// because it lives on the phone and outlives any one session.
export function changePassword(currentPassword: string, password: string) {
  return postAuth<string>('/auth/change-password', {
    currentPassword,
    password,
    // The endpoint checks the two match; sending the same value keeps that check satisfied while
    // the screen does its own confirm-field comparison with a message written for this app.
    passwordConfirm: password,
  });
}

// Authenticated GET: uses the held token (set on login/restore, updated by sliding refresh).
async function get<T>(path: string): Promise<ApiResponse<T>> {
  if (!currentToken) return { success: false, message: 'Sesión no iniciada.', data: null as T };
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
  } catch {
    return { success: false, message: 'No se pudo conectar con el servidor.', data: null as T };
  }
  captureRotatedToken(res);
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: `Error del servidor (${res.status}).`, data: null as T };
}

export function me() {
  return get<Me>('/auth/me');
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
  if (!currentToken) return { success: false, message: 'Sesión no iniciada.', data: null as unknown as string };

  const form = new FormData();
  // React Native's FormData takes this shape for a file; the cast is because the DOM typings
  // describe Blob | string and know nothing about it.
  form.append('file', { uri, type: mimeType, name: fileName } as unknown as Blob);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/profile-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      body: form,
    });
  } catch {
    return { success: false, message: 'No se pudo conectar con el servidor.', data: null as unknown as string };
  }
  captureRotatedToken(res);
  const json = (await res.json().catch(() => null)) as ApiResponse<string> | null;
  if (json) return json;
  return { success: false, message: `Error del servidor (${res.status}).`, data: null as unknown as string };
}

// Whether an account still owes us the sign-up details. A social account is minted with just the
// provider's email and display name, so it lands here missing everything else. Mirrors exactly what
// CompleteProfileAsync refuses to save without, so the app never routes someone to a form the
// server would reject, nor holds back one it would accept.
export function isProfileComplete(profile: Me | null): boolean {
  if (!profile) return false;
  const filled = (value: string | null) => typeof value === 'string' && value.trim().length > 0;
  return filled(profile.name) && filled(profile.lastName) && filled(profile.phone) && filled(profile.address);
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
  /** The normal price, for the struck-through "before". */
  price: number;
  offerPrice: number;
  discountPercent: number;
  companyId: string | null;
  companyName: string | null;
  itemTypeName: string | null;
  startsAt: string;
  endsAt: string | null;
}

// The offers running right now, newest first. Not tenant-scoped: a customer shops every merchant.
export function latestOffers(limit = 10) {
  return get<OfferItem[]>(`/itemOffer/latest?limit=${limit}`);
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
  companyId: string | null;
  companyName: string | null;
  /** Units sold in the last 7 days. Null outside the top-weekly endpoint. */
  orderedCount: number | null;
  itemType?: { name?: string | null } | null;
}

// The most-ordered items of the last 7 days, most popular first. Behind auth, unlike the identical
// /public/top-weekly the marketing site uses.
export function topWeekly(limit = 10) {
  return get<TopItem[]>(`/delivery/top-weekly?limit=${limit}`);
}

// A marketplace product (an item from any merchant company).
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
  companyId: string;
  companyName: string;
  categories: string[];
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
  status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  address: string | null;
  // The delivery pin snapshotted at checkout; null on orders placed before the location step.
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  items: { id: string; itemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
  // The fulfilling delivery's status (from /orders/mine), used to tell active orders from finished.
  deliveryStatus?: string | null;
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

export interface CreateOrderInput {
  items: OrderLineInput[];
  notes?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  // Which branch fulfils the order. Only sent when the customer was asked to choose; the server
  // checks it belongs to the merchant and that its quadrant reaches the delivery point.
  officeId?: string;
}

// Place an order. The server rejects lines from more than one merchant; the app blocks it too.
export function createOrder(input: CreateOrderInput) {
  return postAuth<Order>('/delivery/orders', input);
}

export function myOrders() {
  return get<Order[]>('/delivery/orders/mine');
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
}

export function merchantOffices(companyId: string) {
  return get<MerchantOffice[]>(`/delivery/companies/${companyId}/offices`);
}

// Whether a branch can take an order to a point: no quadrant means anywhere, otherwise the point
// must fall inside it. Inclusive on every edge, matching the server and the map picker -- if they
// disagreed, the app could offer a branch the server then refuses.
export function officeCovers(o: MerchantOffice, lat: number | null, lng: number | null): boolean {
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

// Authenticated POST for the driver's status actions. An optional idempotency key (8.5.9) lets a
// retried action -- e.g. the offline queue flushing something that actually went through -- be
// recognised by the server and not applied twice.
async function sendAuth<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, idempotencyKey?: string): Promise<ApiResponse<T>> {
  if (!currentToken) return { success: false, message: 'Sesión no iniciada.', data: null as T };
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
    return { success: false, message: 'No se pudo conectar con el servidor.', data: null as T };
  }
  captureRotatedToken(res);
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: `Error del servidor (${res.status}).`, data: null as T };
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
