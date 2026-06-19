import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import api from './api';
import './LoginPage.css';

const Spline = lazy(() => import('@splinetool/react-spline'));

const SPLINE_URL = 'https://prod.spline.design/io14twxTxeuzLQBf/scene.splinecode';

// ─── SVG ICONS ────────────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="5" fill="white"/>
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const ArrowIcon = () => (
  <svg className="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  
  const glowRef = useRef(null);
  const containerRef = useRef(null);

  // ─── HIDE SPLINE TEXT OBJECTS PROGRAMMATICALLY ──────────────────────────
  const handleSplineLoad = (spline) => {
    // Hide all objects that might be text
    const objects = spline.getAllObjects();
    objects.forEach(obj => {
      const name = (obj.name || '').toLowerCase();
      if (
        name.includes('text') || 
        name.includes('chasing') || 
        name.includes('sunsets') ||
        name.includes('title') ||
        name.includes('paragraph')
      ) {
        obj.visible = false;
        // Also try to move them far away just in case visible=false isn't enough
        if (obj.position) {
          obj.position.x = -999999;
        }
      }
    });
  };

  // ─── HIGH-PERFORMANCE CURSOR TRACKING (SYNCED) ───────────────────────────
  useEffect(() => {
    let mouseX = -9999;
    let mouseY = -9999;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const updateGlow = () => {
      if (glowRef.current) {
        // Use translate3d for best performance and exact cursor alignment
        glowRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }
      requestAnimationFrame(updateGlow);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    const animationFrame = requestAnimationFrame(updateGlow);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  // ─── FORM HANDLERS ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.user, res.token);
      addToast('System Authentication Successful', 'success');
      navigate('/'); 
    } catch (err) {
      addToast(err.message || 'Invalid Credentials', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page" ref={containerRef}>

      {/* ── AMBIENT ORBS ─────────────────── */}
      <div className="ambient-orb orb-1" />
      <div className="ambient-orb orb-2" />

      {/* ── CURSOR ORANGE GLOW (Lag-free) ── */}
      <div
        ref={glowRef}
        className="cursor-glow"
      />

      {/* ── SPLINE 3D BACKGROUND (Centered) ── */}
      <div className="spline-container centered-spline">
        <Suspense fallback={null}>
          <Spline 
            scene={SPLINE_URL} 
            onLoad={handleSplineLoad}
          />
        </Suspense>
      </div>

      {/* ── PAGE LAYOUT (Centered) ────────── */}
      <div className="login-layout centered-layout">

        {/* LEFT: BRANDING (Centered) */}
        <div className="brand-side">
          <div className="brand-content-wrapper">
            <div className="brand-logo-container">
              <img 
                src="https://pragatiurza.com/wp-content/uploads/2024/06/new-logo.png" 
                alt="Logo" 
                className="brand-logo-main" 
              />
            </div>

            <h1 className="brand-title">
              Pragati<br />
              <span className="highlight">Solar</span>
            </h1>

            <p className="brand-tagline">
              Empowering solar businesses with smart, real-time inventory control. 
              Manage your stock, track products, and grow faster.
            </p>
          </div>
        </div>

        {/* RIGHT: LOGIN FORM */}
        <div className="form-side">
          <div className="login-card">

            <div className="card-header">
              <div className="card-logo">
                <div className="logo-icon">
                  <SunIcon />
                </div>
                <span className="logo-name">Pragati Solar</span>
              </div>
              <h2 className="card-title">Welcome back</h2>
              <p className="card-subtitle">Sign in to access your inventory dashboard</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {/* Username */}
              <div className="field-group">
                <label className="field-label" htmlFor="email">Username / Email</label>
                <div className="field-input-wrapper">
                  <div className="field-icon"><UserIcon /></div>
                  <input
                    id="email"
                    type="text"
                    name="email"
                    className="field-input"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="field-group">
                <label className="field-label" htmlFor="password">Password</label>
                <div className="field-input-wrapper">
                  <div className="field-icon"><LockIcon /></div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="field-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="eye-toggle"
                    onClick={() => setShowPassword(p => !p)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              {/* Options Row */}
              <div className="form-options">
                <label className="remember-check">
                  <input
                    type="checkbox"
                    name="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="login-btn"
                disabled={isLoading}
                id="login-submit-btn"
              >
                {isLoading ? (
                  <span className="btn-content">Signing in…</span>
                ) : (
                  <span className="btn-content">
                    Sign In <ArrowIcon />
                  </span>
                )}
              </button>
            </form>

            <div className="form-divider" style={{ marginTop: 20 }}>
              <div className="divider-line" />
              <span className="divider-text">SECURED ACCESS</span>
              <div className="divider-line" />
            </div>

            <div className="card-footer">
              Having trouble? <a href="#">Contact IT Support</a>
              <div className="footer-copy">
                <span>Pragati Solar</span>
                <div className="footer-dot" />
                <span>Inventory v2.0</span>
                <div className="footer-dot" />
                <span>© 2026</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
