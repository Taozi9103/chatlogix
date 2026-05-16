'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import http from '@/lib/http';
import { registerSchema, validateOrThrow, ValidationError } from '@/lib/validation';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ---- zod 参数校验 ----
    try {
      validateOrThrow(registerSchema, { username, password });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        setError(err.messages[0]);
      }
      return;
    }

    setLoading(true);

    try {
      const response = await http.post('/api/auth/register', {
        username,
        password
      });

      const body = response.data;
      if (body?.success) {
        router.push('/login');
      } else {
        setError(body?.error?.message || '注册失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>注册 ChatLogix</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder="用户名（2-50个字符）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="密码（至少6个字符）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="auth-link">
          已有账号？ <Link href="/login">立即登录</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
