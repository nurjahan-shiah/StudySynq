'use client';

import { useState, useEffect, useRef, useCallback, FormEvent, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { Logo, LogoIcon } from './Logo';
import { BellIcon } from './BellIcon';
import { ProfileSetupModal } from './ProfileSetupModal';
import { ProductTour } from './ProductTour';
import {
  changeAccountEmail,
  changeAccountPassword,
  deactivateAccount,
  getMyProfile,
  reactivateAccount,
  type FullProfile,
} from '@/lib/social';

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
  blue: 'var(--ss-blue)',
  green: 'var(--ss-green)',
  yellow: 'var(--ss-yellow)',
} as const;

// Same palette as the dashboard stat cards, so each nav item's accent color
// matches its counterpart section on /dashboard (groups=blue, sessions=green,
// recommended=yellow, tasks/everything-else=red as the default brand color).
const NAV: {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
  color: string;
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '⊞',
    path: '/dashboard',
    color: T.red,
  },
  {
    id: 'groups',
    label: 'Study groups',
    icon: '⚇',
    path: '/groups',
    color: T.blue,
  },
  {
    id: 'courses',
    label: 'Courses',
    icon: '◎',
    path: '/courses',
    color: T.blue,
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: '▦',
    path: '/sessions',
    color: T.green,
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: '⊟',
    path: '/resources',
    color: T.green,
  },
  {
    id: 'recommendations',
    label: 'Recommended',
    icon: '✦',
    path: '/recommendations',
    color: T.yellow,
  },
  {
    id: 'tasks',
    label: 'My tasks',
    icon: '✓',
    path: '/tasks',
    color: T.red,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <BellIcon size={15} />,
    path: '/notifications',
    color: T.red,
  },
];

// US-F.2 / US-F.6 — admin-only entries, appended to NAV when the user is an admin
const ADMIN_NAV = [
  {
    id: 'admin',
    label: 'Admin course management',
    icon: '⚙',
    path: '/admin',
    color: T.red,
  },
  {
    id: 'health',
    label: 'System health',
    icon: '◉',
    path: '/admin/health',
    color: T.green,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: '◔',
    path: '/admin/analytics',
    color: T.blue,
  },
  {
    id: 'moderation',
    label: 'Moderation',
    icon: '⚑',
    path: '/admin/moderation',
    color: T.yellow,
  },
] as const;

function ProfilePanel({
  user,
  theme,
  onToggleTheme,
  onClose,
  onLogout,
  onDeactivate,
  onReactivate,
  onNotificationPrefs,
  onEditProfile,
  onChangeEmail,
  onChangePassword,
  profileComplete,
  isActive,
}: {
  user: UserInfo;
  theme: Theme;
  onToggleTheme: () => void;
  onClose: () => void;
  onLogout: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onNotificationPrefs: () => void;
  onEditProfile: () => void;
  onChangeEmail: () => void;
  onChangePassword: () => void;
  profileComplete: boolean;
  isActive: boolean;
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
          Profile
        </p>

        <Row
          icon="👤"
          label={user.role === 'admin' ? 'Edit admin profile' : profileComplete ? 'Edit profile' : 'Complete your profile'}
          onClick={onEditProfile}
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

        <Row icon="✉" label="Change email" onClick={onChangeEmail} />

        <Row icon="🔒" label="Change password" onClick={onChangePassword} />

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
            label={isActive ? 'Deactivate account' : 'Activate profile'}
            onClick={isActive ? onDeactivate : onReactivate}
            danger={isActive}
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
          StudySynq · York University · 2026
        </p>
      </div>
    </div>
  );
}

// ── Sidebar (nav only — no avatar here) ───────────────────────────────────────

type AccountAction = 'email' | 'password' | 'deactivate';

function AccountActionModal({
  mode, userId, currentEmail, onClose, onUpdated,
}: {
  mode: AccountAction;
  userId: string;
  currentEmail: string;
  onClose: () => void;
  onUpdated: (profile: FullProfile) => void;
}) {
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [period, setPeriod] = useState<'30' | '60' | 'permanent'>('30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const title = mode === 'email' ? 'Change email' : mode === 'password' ? 'Change password' : 'Deactivate account';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'password' && newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (mode === 'deactivate' && reason.trim().length < 3) {
      setError('Please provide a reason for deactivation.');
      return;
    }

    setSubmitting(true);
    const response = mode === 'email'
      ? await changeAccountEmail(userId, { new_email: newEmail.trim(), current_password: currentPassword })
      : mode === 'password'
        ? await changeAccountPassword(userId, { current_password: currentPassword, new_password: newPassword })
        : await deactivateAccount(userId, {
            reason: reason.trim(),
            period_days: period === 'permanent' ? null : Number(period) as 30 | 60,
          });
    setSubmitting(false);

    if (response.error) {
      setError(response.error);
      return;
    }
    if (mode !== 'password' && response.data) onUpdated(response.data as FullProfile);
    setSuccess(true);
  }

  async function activateProfile() {
    setReactivating(true);
    setError('');
    const response = await reactivateAccount(userId);
    setReactivating(false);
    if (response.error || !response.data) {
      setError(response.error ?? 'Could not activate the profile.');
      return;
    }
    onUpdated(response.data);
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(0,0,0,.5)' }} />
      <div role="dialog" aria-modal="true" aria-labelledby="account-action-title" style={{
        position: 'fixed', zIndex: 311, top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(430px, calc(100vw - 32px))', borderRadius: 16, padding: 24,
        background: T.bg2, border: `1px solid ${T.border}`, boxShadow: '0 18px 60px rgba(0,0,0,.35)',
      }}>
        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, margin: '0 auto 12px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,184,148,.14)', color: 'var(--ss-green)', fontSize: 22,
            }}>✓</div>
            <h2 id="account-action-title" style={{ color: T.text, fontSize: 17, margin: '0 0 8px' }}>
              {mode === 'deactivate' ? 'Account deactivated' : mode === 'email' ? 'Email updated' : 'Password updated'}
            </h2>
            <p style={{ color: T.text2, fontSize: 12.5, lineHeight: 1.55, margin: '0 0 18px' }}>
              {mode === 'deactivate'
                ? `Your profile is inactive${period === 'permanent' ? ' permanently' : ` for ${period} days`}.`
                : 'Your account changes were saved successfully.'}
            </p>
            {mode === 'deactivate' ? (
              <button className="ss-btn-primary" onClick={activateProfile} disabled={reactivating}>
                {reactivating ? 'Activating…' : 'Activate Profile'}
              </button>
            ) : (
              <button className="ss-btn-primary" onClick={onClose}>Done</button>
            )}
            {error && <p style={{ color: T.red, fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <h2 id="account-action-title" style={{ color: T.text, fontSize: 17, margin: 0 }}>{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close" style={{
                border: 0, background: 'transparent', color: T.text2, cursor: 'pointer', fontSize: 18,
              }}>×</button>
            </div>

            {mode === 'email' && (
              <>
                <p style={{ color: T.text2, fontSize: 12, margin: '0 0 16px' }}>Enter the new admin email and confirm your password.</p>
                <ModalField label="New email">
                  <input className="ss-input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                </ModalField>
                <ModalField label="Current password">
                  <input className="ss-input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                </ModalField>
              </>
            )}

            {mode === 'password' && (
              <>
                <p style={{ color: T.text2, fontSize: 12, margin: '0 0 16px' }}>Use at least 8 characters with a letter and number.</p>
                <ModalField label="Current password">
                  <input className="ss-input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                </ModalField>
                <ModalField label="New password">
                  <input className="ss-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
                </ModalField>
                <ModalField label="Confirm new password">
                  <input className="ss-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required />
                </ModalField>
              </>
            )}

            {mode === 'deactivate' && (
              <>
                <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.5, margin: '0 0 16px' }}>
                  Access will be disabled after your current session ends. You can activate the profile again now.
                </p>
                <ModalField label="Reason">
                  <textarea className="ss-input" value={reason} onChange={e => setReason(e.target.value.slice(0, 500))}
                    rows={3} placeholder="Why are you deactivating this account?" required
                    style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                </ModalField>
                <ModalField label="Deactivation period">
                  <select className="ss-input" value={period} onChange={e => setPeriod(e.target.value as typeof period)}>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="permanent">Permanent</option>
                  </select>
                </ModalField>
              </>
            )}

            {error && <p role="alert" style={{ color: T.red, fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
              <button type="button" className="ss-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="ss-btn-primary" disabled={submitting}
                style={mode === 'deactivate' ? { background: T.red } : undefined}>
                {submitting ? 'Saving…' : mode === 'deactivate' ? 'Confirm deactivation' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', color: T.text, fontSize: 12, fontWeight: 700, marginBottom: 13 }}>
      <span style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      <span style={{ display: 'block' }}>{children}</span>
    </label>
  );
}

const SIDEBAR_COLLAPSE_KEY = 'ss_sidebar_collapsed';
const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 60;

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  // Show the admin-only Moderation entry when the logged-in user is an admin (US-F.2).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(localStorage.getItem('ss_user_role') === 'admin');
  }, []);

  // Collapsed state persists across pages/navigation.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const nav = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const activeId =
    nav.find((item) =>
      item.path === '/dashboard' || item.path === '/admin'
        ? pathname === item.path
        : pathname.startsWith(item.path),
    )?.id ?? 'dashboard';

  return (
    <aside
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        background: T.bg2,
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '0 6px' : '0 10px',
        transition: 'width 0.18s ease, padding 0.18s ease',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: '18px 6px 14px',
        }}
      >
        {!collapsed && <Logo iconSize={32} wordmarkSize="1.2rem" linked={false} />}
        {collapsed && <LogoIcon size={28} />}

        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.text2,
              fontSize: 15,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            «
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggleCollapsed}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.text2,
            fontSize: 15,
            padding: '4px 0 10px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          »
        </button>
      )}

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
              data-tour={item.id}
              onClick={() => router.push(item.path)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '9px 0' : '8px 10px',
                borderRadius: 9,
                fontSize: 13,
                color: isActive ? item.color : T.text2,
                background: isActive ? `${item.color}18` : 'transparent',
                borderLeft: isActive ? `2px solid ${item.color}` : '2px solid transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                fontWeight: isActive ? 700 : 400,
                justifyContent: collapsed ? 'center' : 'flex-start',
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

              {!collapsed && (
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && <ProductTour />}
    </aside>
  );
}

// ── ProfileButton — drop this in the top-right of any page's main area ────────

export function ProfileButton() {
  const router = useRouter();

  const [profileOpen, setProfileOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [userId, setUserId] = useState('');
  const [theme, setTheme] = useState<Theme>('dark');
  const [profileComplete, setProfileComplete] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [user, setUser] = useState<UserInfo>({
    name: '',
    email: '',
    role: '',
  });

  const applyProfile = useCallback((profile: FullProfile) => {
    setUser({ name: profile.name, email: profile.email, role: profile.role });
    setProfileComplete(profile.profile_complete);
    setIsActive(profile.is_active);
    localStorage.setItem('ss_user_name', profile.name);
    localStorage.setItem('ss_user_email', profile.email);
  }, []);

  const refreshProfile = useCallback(async (id: string) => {
    const response = await getMyProfile(id);
    if (response.data) applyProfile(response.data);
  }, [applyProfile]);

  useEffect(() => {
    const stored = (localStorage.getItem('ss-theme') as Theme) || 'dark';

    setTheme(stored);

    setUser({
      name: localStorage.getItem('ss_user_name') ?? '',
      email: localStorage.getItem('ss_user_email') ?? '',
      role: localStorage.getItem('ss_user_role') ?? '',
    });
    const id = localStorage.getItem('ss_user_id') ?? '';
    setUserId(id);
    if (id) void refreshProfile(id);
  }, [refreshProfile]);

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

  async function handleReactivate() {
    if (!userId) return;
    const response = await reactivateAccount(userId);
    if (response.data) applyProfile(response.data);
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
            onDeactivate={() => {
              setProfileOpen(false);
              setAccountAction('deactivate');
            }}
            onReactivate={handleReactivate}
            profileComplete={profileComplete}
            isActive={isActive}
            onChangeEmail={() => {
              setProfileOpen(false);
              setAccountAction('email');
            }}
            onChangePassword={() => {
              setProfileOpen(false);
              setAccountAction('password');
            }}
            onNotificationPrefs={() => {
              setProfileOpen(false);
              router.push('/notifications/preferences');
            }}
            onEditProfile={() => {
              setProfileOpen(false);
              setEditProfileOpen(true);
            }}
          />
        </>
      )}

      {editProfileOpen && userId && (
        <ProfileSetupModal
          userId={userId}
          role={user.role}
          onClose={() => setEditProfileOpen(false)}
          onSaved={() => void refreshProfile(userId)}
        />
      )}

      {accountAction && userId && (
        <AccountActionModal
          mode={accountAction}
          userId={userId}
          currentEmail={user.email}
          onClose={() => setAccountAction(null)}
          onUpdated={applyProfile}
        />
      )}
    </>
  );
}

export default Sidebar;