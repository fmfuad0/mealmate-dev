/**
 * GoogleSignInButton — custom-styled button backed by a real Google OAuth button.
 *
 * How it works:
 *  - The visible layer is our custom CSS button (Google G icon, label, hover states)
 *  - An invisible div is positioned absolutely on top, into which we call
 *    `google.accounts.id.renderButton()` — this renders a real, functional
 *    Google button that reliably opens the OAuth popup regardless of One Tap
 *    cooldowns or suppression rules.
 *  - The user sees our button; clicking anywhere in it actually clicks
 *    the transparent Google button underneath, which triggers the OAuth popup.
 */
import { useEffect, useRef, useCallback } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

interface Props {
  /** Called with the raw id_token credential once the user signs in. */
  onCredential: (idToken: string) => void;
  loading?: boolean;
  label?: string;
  disabled?: boolean;
}

export function GoogleSignInButton({ onCredential, loading = false, label = 'Continue with Google', disabled = false }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const renderGoogleButton = useCallback(() => {
    if (!overlayRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => {
        onCredential(response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    // Use container width so the Google button is at least as wide as our button
    const width = containerRef.current?.offsetWidth ?? 320;

    window.google.accounts.id.renderButton(overlayRef.current, {
      type: 'standard',
      size: 'large',
      theme: 'outline',
      width: Math.min(width, 400),
      text: 'continue_with',
      shape: 'rectangular',
    });
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || loading || disabled) return;

    if (window.google) {
      renderGoogleButton();
    } else {
      const id = setInterval(() => {
        if (window.google) {
          clearInterval(id);
          renderGoogleButton();
        }
      }, 100);
      return () => clearInterval(id);
    }
  }, [renderGoogleButton, loading, disabled]);

  // Re-render if onCredential changes (e.g. context switch between login/signup)
  useEffect(() => {
    if (!loading && !disabled && window.google) {
      renderGoogleButton();
    }
  }, [onCredential, renderGoogleButton, loading, disabled]);

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* ── Visible custom-styled button ───────────────────────────────────── */}
      <div
        className={[
          'flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5',
          'text-sm font-medium text-foreground shadow-sm',
          'transition-all duration-150 hover:bg-muted hover:shadow-md',
          loading || disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {loading ? (
          <svg className="animate-spin h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          /* Official Google "G" SVG */
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
        )}
        <span>{loading ? 'Connecting…' : label}</span>
      </div>

      {/* ── Invisible Google button overlay ────────────────────────────────── */}
      {/* The real OAuth popup is triggered by clicking Google's rendered button.  */}
      {/* We hide it visually but keep it positioned on top so clicks hit it.     */}
      {!loading && !disabled && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden opacity-0 z-10"
          style={{ borderRadius: '8px', cursor: 'pointer' }}
        />
      )}
    </div>
  );
}
