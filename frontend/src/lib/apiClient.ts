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

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('ss_token');
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

  async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      // 204 No Content (e.g. DELETE) and other empty responses have no JSON body.
      const text = await response.text();
      const data = text ? JSON.parse(text) : undefined;

      if (!response.ok) {
        throw new Error((data && data.detail) || 'Request failed');
      }

      return { data, status: response.status };
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
}

export const apiClient = new ApiClient();