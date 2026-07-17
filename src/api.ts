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
  document: string | null;
  isClient: boolean;
  isDriver: boolean;
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
  notes: string | null;
  receiverName: string | null;
  failureReason: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  phone: string;
  document: string;
  type: 'client' | 'driver';
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
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

export function myDeliveries() {
  return get<Delivery[]>('/delivery/mine');
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

export function deliverDelivery(id: string, receiverName: string, idempotencyKey?: string) {
  return postAuth<Delivery>(`/delivery/${id}/deliver`, { receiverName }, idempotencyKey);
}

export function failDelivery(id: string, reason: string, notes: string, idempotencyKey?: string) {
  return postAuth<Delivery>(`/delivery/${id}/fail`, { reason, notes }, idempotencyKey);
}
