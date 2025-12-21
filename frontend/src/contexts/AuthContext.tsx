import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const initializeAuth = async () => {
      try {
        // Check if we have OAuth callback parameters in the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const accessToken = hashParams.get('access_token');
        
        console.log('[AuthContext] Initializing auth...', {
          hasCode: !!code,
          hasAccessToken: !!accessToken,
          url: window.location.href
        });
        
        // If we have a code parameter, explicitly exchange it for a session
        // This is more reliable than relying on Supabase's auto-detection on mobile
        if (code) {
          console.log('[AuthContext] OAuth code detected, exchanging for session...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('[AuthContext] Error exchanging code for session:', error);
            // Clear the URL params to prevent re-processing
            window.history.replaceState({}, '', window.location.pathname);
          } else if (data.session) {
            console.log('[AuthContext] Successfully exchanged code for session');
            if (isMounted) {
              setSession(data.session);
              setUser(data.session.user);
              setLoading(false);
              // Clear the URL params
              window.history.replaceState({}, '', window.location.pathname);
            }
            return; // Exit early, we have a session
          }
        }
        
        // If we have an access_token in hash (implicit flow), let Supabase handle it
        if (accessToken) {
          console.log('[AuthContext] Access token detected in hash, letting Supabase handle it...');
          // Supabase should automatically detect and process this
          // Give it a moment to process
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Get the current session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AuthContext] Error getting session:', error);
        }
        
        console.log('[AuthContext] Got session:', !!session);
        
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error('[AuthContext] Error initializing auth:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    // Initialize auth
    initializeAuth();
    
    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AuthContext] Auth state changed:', _event);
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        // Clear timeout if auth succeeds
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    });
    
    // Fallback timeout to prevent infinite loading (15 seconds - increased for mobile)
    timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('[AuthContext] Auth initialization timeout, forcing loading to false');
        setLoading(false);
      }
    }, 15000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error as Error | null };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
