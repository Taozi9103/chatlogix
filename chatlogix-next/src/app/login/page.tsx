'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import http from '@/lib/http';
import { loginSchema, validateOrThrow, ValidationError } from '@/lib/validation';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // ---- zod 参数校验 ----
    try {
      validateOrThrow(loginSchema, { username, password });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        setError(err.messages[0]);
      }
      return;
    }

    setLoading(true);

    try {
      const response = await http.post('/api/auth/login', {
        username,
        password
      });

      const body = response.data;
      if (!body?.success) {
        throw new Error(body?.error?.message || '登录失败');
      }
      const { token, user } = body.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>登录 ChatLogix</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors({});
              }}
              required
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors({});
              }}
              required
            />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="auth-link">
          还没有账号？ <Link href="/register">立即注册</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
