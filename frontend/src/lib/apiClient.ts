/**
 * API Client for StudySync Frontend
 * Connects to API Gateway (port 8000)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  user_email: string;
  user_role: string;
  is_first_login: boolean;
}

interface JwtPayload {
  exp?: number;
}

class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;

    return localStorage.getItem('ss_token');
  }

  private saveSession(data: RefreshResponse): void {
    if (typeof window === 'undefined') return;

    localStorage.setItem('ss_token', data.access_token);

    localStorage.setItem('ss_user_id', data.user_id);

    localStorage.setItem('ss_user_email', data.user_email);

    localStorage.setItem('ss_user_role', data.user_role);

    localStorage.setItem('ss_user_name', data.user_email.split('@')[0]);
  }

  private clearSession(): void {
    if (typeof window === 'undefined') return;

    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user_id');
    localStorage.removeItem('ss_user_email');
    localStorage.removeItem('ss_user_role');
    localStorage.removeItem('ss_user_name');
  }

  private redirectToLogin(): void {
    if (typeof window === 'undefined') return;

    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private isPublicAuthEndpoint(endpoint: string): boolean {
    return [
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/health',
    ].includes(endpoint);
  }

  private decodeTokenPayload(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');

      if (parts.length !== 3) {
        return null;
      }

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

      const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

      const decodedPayload = atob(paddedBase64);

      return JSON.parse(decodedPayload) as JwtPayload;
    } catch {
      return null;
    }
  }

  private isTokenExpiringSoon(token: string, thresholdSeconds = 60): boolean {
    const payload = this.decodeTokenPayload(token);

    if (!payload?.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);

    return payload.exp <= currentTime + thresholdSeconds;
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        this.clearSession();
        return false;
      }

      const data = (await response.json()) as RefreshResponse;

      if (!data.access_token) {
        this.clearSession();
        return false;
      }

      this.saveSession(data);

      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async ensureValidAccessToken(): Promise<boolean> {
    const token = this.getToken();

    if (token && !this.isTokenExpiringSoon(token)) {
      return true;
    }

    const refreshed = await this.refreshAccessToken();

    if (!refreshed) {
      this.clearSession();
      this.redirectToLogin();
    }

    return refreshed;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    // 204 No Content (e.g. DELETE) and other empty responses have no JSON body.
    const text = await response.text();

    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    hasRetried = false,
  ): Promise<ApiResponse<T>> {
    try {
      const isPublicRoute = this.isPublicAuthEndpoint(endpoint);

      if (!isPublicRoute) {
        const hasValidSession = await this.ensureValidAccessToken();

        if (!hasValidSession) {
          return {
            error: 'Your session has expired.',
            status: 401,
          };
        }
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        credentials: 'include',
        headers: this.getHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401 && !isPublicRoute && !hasRetried) {
        const refreshed = await this.refreshAccessToken();

        if (refreshed) {
          return this.request<T>(method, endpoint, body, true);
        }

        this.clearSession();
        this.redirectToLogin();

        return {
          error: 'Your session has expired.',
          status: 401,
        };
      }

      const data = await this.parseResponse(response);

      if (!response.ok) {
        const errorData =
          typeof data === 'object' && data !== null
            ? (data as { detail?: string })
            : null;

        return {
          error:
            errorData?.detail ||
            (typeof data === 'string' ? data : 'Request failed'),
          status: response.status,
        };
      }

      return {
        data: data as T,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 0,
      };
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>('GET', endpoint);
  }

  post<T>(endpoint: string, body: any) {
    return this.request<T>('POST', endpoint, body);
  }

  put<T>(endpoint: string, body: any) {
    return this.request<T>('PUT', endpoint, body);
  }

  patch<T>(endpoint: string, body?: any) {
    return this.request<T>('PATCH', endpoint, body);
  }

  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      this.clearSession();
      this.redirectToLogin();
    }
  }
}

export const apiClient = new ApiClient();
