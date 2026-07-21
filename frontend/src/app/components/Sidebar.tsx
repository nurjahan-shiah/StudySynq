'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { Logo } from './Logo';
import { BellIcon } from './BellIcon';

type Theme = 'dark' | 'light';

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

const T = {
  bg2: 'var(--bg2)',
  bg3: 'var(--bg3)',
  border: 'var(--border)',
  text: 'var(--text)',
  text2: 'var(--text2)',
  red: 'var(--ss-red)',
} as const;

const NAV: {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '⊞',
    path: '/dashboard',
  },
  {
    id: 'groups',
    label: 'Study groups',
    icon: '⚇',
    path: '/groups',
  },
  {
    id: 'courses',
    label: 'Courses',
    icon: '◎',
    path: '/courses',
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: '▦',
    path: '/sessions',
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: '⊟',
    path: '/resources',
  },
  {
    id: 'recommendations',
    label: 'Recommended',
    icon: '✦',
    path: '/recommendations',
  },
  {
    id: 'tasks',
    label: 'My tasks',
    icon: '✓',
    path: '/tasks',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <BellIcon size={15} />,
    path: '/notifications',
  },
];

// US-F.2 / US-F.6 — admin-only entries, appended to NAV when the user is an admin
const ADMIN_NAV = [
  {
    id: 'analytics',
    label: 'Analytics',
    icon: '◔',
    path: '/admin/analytics',
  },
  {
    id: 'moderation',
    label: 'Moderation',
    icon: '⚑',
    path: '/admin/moderation',
  },
] as const;

function ProfilePanel({
  user,
  theme,
  onToggleTheme,
  onClose,
  onLogout,
  onDeactivate,
  onNotificationPrefs,
}: {
  user: UserInfo;
  theme: Theme;
  onToggleTheme: () => void;
  onClose: () => void;
  onLogout: () => void;
  onDeactivate: () => void;
  onNotificationPrefs: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handle);

    return () => {
      document.removeEventListener('mousedown', handle);
    };
  }, [onClose]);

  const initial = (user.name || user.email || '?')[0].toUpperCase();

  const Row = ({
    icon,
    label,
    onClick,
    danger = false,
  }: {
    icon: string;
    label: string;
    onClick?: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 12px',
        borderRadius: 8,
        background: 'transparent',
        border: 'none',
        color: danger ? T.red : T.text,
        cursor: 'pointer',
        fontSize: 13,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.bg3;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          fontSize: 16,
          width: 20,
          textAlign: 'center',
        }}
      >
        {icon}
      </span>

      {label}
    </button>
  );

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 280,
        height: '100vh',
        background: T.bg2,
        borderLeft: `1px solid ${T.border}`,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      }}
    >
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.text,
          }}
        >
          Profile
        </span>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: T.text2,
            padding: 2,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          padding: '24px 16px 20px',
          borderBottom: `1px solid ${T.border}`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: T.red,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 700,
            margin: '0 auto 12px',
          }}
        >
          {initial}
        </div>

        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: T.text,
            margin: '0 0 4px',
          }}
        >
          {user.name || 'Guest'}
        </p>

        <p
          style={{
            fontSize: 12,
            color: T.text2,
            margin: '0 0 8px',
          }}
        >
          {user.email || 'Not signed in'}
        </p>

        {user.role && (
          <span
            style={{
              fontSize: 11,
              padding: '2px 10px',
              borderRadius: 20,
              background: `${T.red}20`,
              color: T.red,
              fontWeight: 600,
            }}
          >
            {user.role}
          </span>
        )}
      </div>

      <div
        style={{
          padding: '12px 8px',
          flex: 1,
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.text2,
            padding: '4px 12px 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Appearance
        </p>

        <Row
          icon={theme === 'dark' ? '☀️' : '🌙'}
          label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={onToggleTheme}
        />

        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T.text2,
            padding: '16px 12px 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Account
        </p>

        <Row
          icon="🔔"
          label="Notification preferences"
          onClick={onNotificationPrefs}
        />

        <Row icon="✉" label="Change email" />

        <Row icon="🔒" label="Change password" />

        <Row icon="↩" label="Log out" onClick={onLogout} />

        <div
          style={{
            margin: '12px 8px 0',
            borderTop: `1px solid ${T.border}`,
            paddingTop: 12,
          }}
        >
          <Row
            icon="⚠"
            label="Deactivate account"
            onClick={onDeactivate}
            danger
          />
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: T.text2,
            margin: 0,
            textAlign: 'center',
          }}
        >
          StudySync · York University · 2026
        </p>
      </div>
    </div>
  );
}

// ── Sidebar (nav only — no avatar here) ───────────────────────────────────────

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // Show the admin-only Moderation entry when the logged-in user is an admin (US-F.2).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(localStorage.getItem('ss_user_role') === 'admin');
  }, []);
  const nav = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const activeId =
    nav.find((item) =>
      item.path !== '/dashboard'
        ? pathname.startsWith(item.path)
        : pathname === item.path,
    )?.id ?? 'dashboard';

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        background: T.bg2,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 10px',
      }}
    >
      <div
        style={{
          padding: '18px 6px 14px',
        }}
      >
        <Logo iconSize={32} wordmarkSize="1.2rem" linked={false} />
      </div>

      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flex: 1,
        }}
      >
        {nav.map((item) => {
          const isActive = item.id === activeId;

          return (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 9,
                fontSize: 13,
                color: isActive ? T.red : T.text2,
                background: isActive ? `${T.red}15` : 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontWeight: isActive ? 700 : 400,
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  flexShrink: 0,
                  width: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </span>

              <span
                style={{
                  flex: 1,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ── ProfileButton — drop this in the top-right of any page's main area ────────

export function ProfileButton() {
  const router = useRouter();

  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  const [user, setUser] = useState<UserInfo>({
    name: '',
    email: '',
    role: '',
  });

  useEffect(() => {
    const stored = (localStorage.getItem('ss-theme') as Theme) || 'dark';

    setTheme(stored);

    setUser({
      name: localStorage.getItem('ss_user_name') ?? '',
      email: localStorage.getItem('ss_user_email') ?? '',
      role: localStorage.getItem('ss_user_role') ?? '',
    });
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';

    setTheme(next);

    document.documentElement.setAttribute('data-theme', next);

    localStorage.setItem('ss-theme', next);
  }

  async function handleLogout() {
    setProfileOpen(false);
    await apiClient.logout();
  }

  async function handleDeactivate() {
    if (confirm('Deactivate your account? This cannot be undone.')) {
      await handleLogout();
    }
  }

  const initial = (user.name || user.email || '?')[0].toUpperCase();

  return (
    <>
      <button
        onClick={() => setProfileOpen(true)}
        title="Profile"
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: T.red,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initial}
      </button>

      {profileOpen && (
        <>
          <div
            onClick={() => setProfileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 199,
            }}
          />

          <ProfilePanel
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            onClose={() => setProfileOpen(false)}
            onLogout={handleLogout}
            onDeactivate={handleDeactivate}
            onNotificationPrefs={() => {
              setProfileOpen(false);
              router.push('/notifications/preferences');
            }}
          />
        </>
      )}
    </>
  );
}

export default Sidebar;
