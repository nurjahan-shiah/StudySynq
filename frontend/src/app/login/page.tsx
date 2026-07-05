'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API =
process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type LoginResponse = {
access_token: string;
token_type: string;
user_id: string;
user_email: string;
user_role: string;
is_first_login: boolean;
};

type ErrorResponse = {
detail?: string;
};

export default function LoginPage() {
const router = useRouter();

const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

async function handleSubmit(
event: FormEvent<HTMLFormElement>,
) {
event.preventDefault();
setError('');
setLoading(true);

try {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  const responseBody = (await response
    .json()
    .catch(() => null)) as
    | LoginResponse
    | ErrorResponse
    | null;

  if (response.status === 401) {
    setError('Invalid email or password.');
    setPassword('');
    return;
  }

  if (!response.ok) {
    const errorBody = responseBody as ErrorResponse | null;

    setError(
      errorBody?.detail ||
        'Login failed. Please try again.',
    );

    setPassword('');
    return;
  }

  const loginData = responseBody as LoginResponse | null;

  if (!loginData?.access_token) {
    setError(
      'The server returned an invalid login response.',
    );
    setPassword('');
    return;
  }

  localStorage.setItem(
    'ss_token',
    loginData.access_token,
  );

  localStorage.setItem(
    'ss_user_id',
    loginData.user_id,
  );

  localStorage.setItem(
    'ss_user_email',
    loginData.user_email,
  );

  localStorage.setItem(
    'ss_user_role',
    loginData.user_role,
  );

  localStorage.setItem(
    'ss_user_name',
    loginData.user_email.split('@')[0],
  );

  router.replace('/dashboard');
} catch {
  setError(
    'Could not connect to the server. Please try again.',
  );

  setPassword('');
} finally {
  setLoading(false);
}
}

return (
<main
style={{
minHeight: '100vh',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
padding: '24px',
background: 'var(--ss-bg, #0f172a)',
}}
>
<section
style={{
width: '100%',
maxWidth: '420px',
padding: '32px',
borderRadius: '18px',
background: 'var(--ss-card, #ffffff)',
color: 'var(--ss-text, #111827)',
boxShadow: '0 20px 50px rgba(0,0,0,.18)',
}}
>
<h1
style={{
fontSize: '28px',
fontWeight: 800,
marginBottom: '8px',
}}
>
Log in to StudySync </h1>
<p
      style={{
        marginBottom: '24px',
        color: '#6b7280',
      }}
    >
      Continue to your study groups and course dashboard.
    </p>

    {error && (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          marginBottom: '16px',
          padding: '12px',
          borderRadius: '10px',
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '14px',
        }}
      >
        {error}
      </div>
    )}

    <form
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <label
        htmlFor="login-email"
        style={{
          display: 'block',
          marginBottom: '6px',
          fontWeight: 600,
        }}
      >
        Email
      </label>

      <input
        id="login-email"
        name="studysync-login-email"
        type="email"
        value={email}
        onChange={(event) =>
          setEmail(event.target.value)
        }
        placeholder="you@example.com"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={loading}
        required
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #d1d5db',
          marginBottom: '16px',
        }}
      />

      <label
        htmlFor="login-password"
        style={{
          display: 'block',
          marginBottom: '6px',
          fontWeight: 600,
        }}
      >
        Password
      </label>

      <input
        id="login-password"
        name="studysync-login-password"
        type="password"
        value={password}
        onChange={(event) =>
          setPassword(event.target.value)
        }
        placeholder="Enter your password"
        autoComplete="new-password"
        disabled={loading}
        required
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #d1d5db',
          marginBottom: '20px',
        }}
      />

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: 'none',
          background: '#dc2626',
          color: 'white',
          fontWeight: 700,
          cursor: loading
            ? 'not-allowed'
            : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Logging in...' : 'Log in'}
      </button>
    </form>

    <p
      style={{
        marginTop: '18px',
        textAlign: 'center',
        fontSize: '14px',
      }}
    >
      Don&apos;t have an account?{' '}

      <Link
        href="/signup"
        style={{
          color: '#dc2626',
          fontWeight: 700,
        }}
      >
        Sign up
      </Link>
    </p>
  </section>
</main>
);
}

