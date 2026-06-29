'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type LoginResponse = {
  access_token: string;
  token_type: string;
  user_id: string;
  user_email: string;
  user_role: string;
  is_first_login: boolean;
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('student@test.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
          email,
          password,
        }),
      });

      if (response.status === 401) {
        setError('Invalid email or password.');
        return;
      }

      if (!response.ok) {
        setError('Login failed. Please try again.');
        return;
      }

      const data: LoginResponse = await response.json();

      localStorage.setItem('ss_token', data.access_token);
      localStorage.setItem('ss_user_id', data.user_id);
      localStorage.setItem('ss_user_email', data.user_email);
      localStorage.setItem('ss_user_role', data.user_role);
      localStorage.setItem('ss_user_name', data.user_email.split('@')[0]);

      router.push('/dashboard');
    } catch {
      setError('Could not connect to the server.');
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
        <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>
          Log in to StudySync
        </h1>

        <p style={{ marginBottom: '24px', color: '#6b7280' }}>
          Continue to your study groups and course dashboard.
        </p>

        {error && (
          <div
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

        <form onSubmit={handleSubmit}>
          <label
            style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '14px' }}>
          Do not have an account?{' '}
          <Link href="/signup" style={{ color: '#dc2626', fontWeight: 700 }}>
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
