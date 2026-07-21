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
  pickupPhone: string | null;
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
  // Collected on the onboarding "person info" step.
  lastName?: string;
  // ISO date (yyyy-MM-dd) from the onboarding "person info" step.
  birthDate?: string | null;
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

// Sign in with Google: the device obtains a Google ID token, the server verifies it and returns our
// JWT as `data` -- signing in an existing account or creating one. `type` only matters for a new
// account (which kind to create); it is ignored for a returning user.
export function googleLogin(idToken: string, type: 'client' | 'driver' = 'client') {
  return post<string>('/auth/google', { idToken, type });
}

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

// The ERP business categories (company business types), shown as the home category row.
export function businessCategories() {
  return get<BusinessCategory[]>('/businessCategory');
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
  createdAt: string;
  items: { id: string; itemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
  // The fulfilling delivery's status (from /orders/mine), used to tell active orders from finished.
  deliveryStatus?: string | null;
}

// The catalog across every merchant, or a single merchant's when companyId is given.
export function products(companyId?: string) {
  const path = companyId ? `/delivery/products?companyId=${encodeURIComponent(companyId)}` : '/delivery/products';
  return get<Product[]>(path);
}

export interface CreateOrderInput {
  items: OrderLineInput[];
  notes?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
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
async function postAuth<T>(path: string, body: unknown, idempotencyKey?: string): Promise<ApiResponse<T>> {
  if (!currentToken) return { success: false, message: 'Sesión no iniciada.', data: null as T };
  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { success: false, message: 'No se pudo conectar con el servidor.', data: null as T };
  }
  captureRotatedToken(res);
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (json) return json;
  return { success: false, message: `Error del servidor (${res.status}).`, data: null as T };
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
