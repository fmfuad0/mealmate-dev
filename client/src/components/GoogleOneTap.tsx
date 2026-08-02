import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { googleLogin } from '@/features/auth/authSlice';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          prompt: (momentListener?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
          cancel: () => void;
          renderButton: (element: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

interface GoogleOneTapProps {
  context?: 'signin' | 'signup';
}

/**
 * Triggers the Google One Tap auto-popup (separate from the button flow).
 *
 * NOTE: GoogleSignInButton also calls `initialize` to set its own callback.
 * GIS allows multiple `initialize` calls — the last one wins. Since
 * GoogleSignInButton mounts after this component and overrides the callback,
 * One Tap will also use the button's callback, which is fine because both
 * do the same thing (dispatch googleLogin).
 *
 * We only call `prompt()` here — the button rendering is handled by
 * GoogleSignInButton via `renderButton()`.
 */
export function GoogleOneTap({ context = 'signin' }: GoogleOneTapProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      const result = await dispatch(googleLogin({ idToken: response.credential }));
      if (googleLogin.fulfilled.match(result) && !result.payload.needsName) {
        navigate('/');
      }
    },
    [dispatch, navigate],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    function showOneTap() {
      if (!window.google) return;

      // Initialize with our callback so One Tap knows where to send the credential
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        context,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Only show the One Tap prompt — the button popup is handled by GoogleSignInButton
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // One Tap suppressed — user will use the button instead; that's fine
        }
      });
    }

    if (window.google) {
      showOneTap();
    } else {
      const id = setInterval(() => {
        if (window.google) {
          clearInterval(id);
          showOneTap();
        }
      }, 100);
      return () => clearInterval(id);
    }

    return () => {
      window.google?.accounts.id.cancel();
    };
  }, [handleCredentialResponse, context]);

  return null;
}
