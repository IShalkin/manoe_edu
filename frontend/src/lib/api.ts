import { supabase } from './supabase';

const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || 'https://manoe-gateway.iliashalkin.com/orchestrate';

/**
 * Get the current user's JWT access token from Supabase
 */
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Make an authenticated fetch request to the orchestrator API
 */
export async function orchestratorFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  return fetch(`${ORCHESTRATOR_URL}${endpoint}`, {
    ...options,
    headers,
  });
}

/**
 * Get the SSE URL with authentication token as query parameter
 * EventSource doesn't support custom headers, so we pass the token as a query param
 */
export async function getAuthenticatedSSEUrl(endpoint: string): Promise<string> {
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const url = new URL(`${ORCHESTRATOR_URL}${endpoint}`);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Get the orchestrator base URL
 */
export function getOrchestratorUrl(): string {
  return ORCHESTRATOR_URL;
}
