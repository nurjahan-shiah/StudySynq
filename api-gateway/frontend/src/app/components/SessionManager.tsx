'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const REFRESH_BUFFER_MS = 60 * 1000;

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
];

type SessionResponse = {
  access_token: string;
  token_type: string;
  user_id: string;
  user_email: string;
  user_role: string;
  is_first_login: boolean;
};

type JwtPayload = {
  exp?: number;
};

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => {
    if (route === '/') {
      return pathname === '/';
    }

    return (
      pathname === route ||
      pathname.startsWith(`${route}/`)
    );
  });
}

function getTokenExpiration(
  token: string,
): number | null {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      '=',
    );

    const payload = JSON.parse(
      atob(paddedBase64),
    ) as JwtPayload;

    if (typeof payload.exp !== 'number') {
      return null;
    }

    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function saveSession(data: SessionResponse): void {
  localStorage.setItem(
    'ss_token',
    data.access_token,
  );

  localStorage.setItem(
    'ss_user_id',
    data.user_id,
  );

  localStorage.setItem(
    'ss_user_email',
    data.user_email,
  );

  localStorage.setItem(
    'ss_user_role',
    data.user_role,
  );

  localStorage.setItem(
    'ss_user_name',
    data.user_email.split('@')[0],
  );
}

function clearSession(): void {
  localStorage.removeItem('ss_token');
  localStorage.removeItem('ss_user_id');
  localStorage.removeItem('ss_user_email');
  localStorage.removeItem('ss_user_role');
  localStorage.removeItem('ss_user_name');
}

export default function SessionManager() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let refreshTimer: ReturnType<
      typeof setTimeout
    > | null = null;

    let cancelled = false;

    const currentRouteIsPublic =
      isPublicRoute(pathname);

    function clearRefreshTimer(): void {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    function expireSession(): void {
      clearSession();

      if (!currentRouteIsPublic) {
        router.replace('/login');
      }
    }

    async function refreshSession(): Promise<
      string | null
    > {
      try {
        const response = await fetch(
          `${API_URL}/auth/refresh`,
          {
            method: 'POST',
            credentials: 'include',
          },
        );

        if (!response.ok) {
          return null;
        }

        const data =
          (await response.json()) as SessionResponse;

        if (!data.access_token) {
          return null;
        }

        saveSession(data);

        return data.access_token;
      } catch {
        return null;
      }
    }

    function scheduleRefresh(token: string): void {
      clearRefreshTimer();

      const expiration = getTokenExpiration(token);

      if (!expiration) {
        void refreshAndReschedule();
        return;
      }

      const refreshDelay = Math.max(
        expiration -
          Date.now() -
          REFRESH_BUFFER_MS,
        0,
      );

      refreshTimer = setTimeout(() => {
        void refreshAndReschedule();
      }, refreshDelay);
    }

    async function refreshAndReschedule(): Promise<void> {
      const newToken = await refreshSession();

      if (cancelled) {
        return;
      }

      if (!newToken) {
        expireSession();
        return;
      }

      scheduleRefresh(newToken);
    }

    async function initializeSession(): Promise<void> {
      const token =
        localStorage.getItem('ss_token');

      if (!token) {
        if (!currentRouteIsPublic) {
          await refreshAndReschedule();
        }

        return;
      }

      const expiration = getTokenExpiration(token);

      if (
        expiration &&
        expiration >
          Date.now() + REFRESH_BUFFER_MS
      ) {
        scheduleRefresh(token);
        return;
      }

      await refreshAndReschedule();
    }

    function handleStorageChange(
      event: StorageEvent,
    ): void {
      if (event.key !== 'ss_token') {
        return;
      }

      if (!event.newValue) {
        expireSession();
        return;
      }

      scheduleRefresh(event.newValue);
    }

    void initializeSession();

    window.addEventListener(
      'storage',
      handleStorageChange,
    );

    return () => {
      cancelled = true;
      clearRefreshTimer();

      window.removeEventListener(
        'storage',
        handleStorageChange,
      );
    };
  }, [pathname, router]);

  return null;
}
