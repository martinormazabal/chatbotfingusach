// frontend/pages/login.js
import React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import styles from './login.module.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/login', { email, password });
      localStorage.setItem('user', JSON.stringify(res.data?.user || res.data));
      router.push('/');
    } catch {
      setError('Correo o contraseña incorrectos');
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/" legacyBehavior>
        <a className={styles.backLink}>← Panel principal</a>
      </Link>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1>Accede a tu cuenta</h1>
          <p>Introduce tus credenciales para continuar gestionando el ecosistema documental.</p>
        </header>

        <form onSubmit={handleLogin} className={styles.form}>
          <label className={styles.inputWrapper}>
            <span>Correo institucional</span>
            <input
              type="email"
              placeholder="nombre.apellido@usach.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className={styles.inputWrapper}>
            <span>Contraseña</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className={styles.submitButton}>
            Ingresar
          </button>

          <p className={styles.helperText}>¿Olvidaste tu contraseña? Contacta a soporte TI de USACH.</p>
          <p className={styles.helperText}>
            ¿Aún no tienes acceso?{' '}
            <Link href="/admin/create-user?source=login" legacyBehavior>
              <a className={styles.ctaLink}>Crear cuentas</a>
            </Link>
          </p>
          <p className={styles.feedback} aria-live="assertive">
            {error}
          </p>
        </form>
      </div>

      <div className={styles.brandCircle} aria-hidden>
        <span>USACH</span>
      </div>
    </div>
  );
}