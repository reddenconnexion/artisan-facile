import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../utils/supabase';
import { seedDemoData } from '../utils/demoData';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const SESSION_CACHE_KEY = 'cached_user_session';

// Helper to cache user session for offline access
const cacheUserSession = (user) => {
    if (user) {
        localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
            user,
            cachedAt: Date.now()
        }));
    } else {
        localStorage.removeItem(SESSION_CACHE_KEY);
    }
};

// Helper to get cached session
const getCachedSession = () => {
    try {
        const cached = localStorage.getItem(SESSION_CACHE_KEY);
        if (cached) {
            const { user, cachedAt } = JSON.parse(cached);
            // Cache is valid for 7 days (reduced from 30 for security)
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - cachedAt < sevenDays) {
                return user;
            }
        }
    } catch (e) {
        console.error('Error reading cached session:', e);
    }
    return null;
};

export const AuthProvider = ({ children }) => {
    // Initialize with cached user for immediate offline access
    const [user, setUser] = useState(() => getCachedSession());
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        // Track online/offline status
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        // Check active sessions and sets the user
        const initSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) throw error;

                if (isMounted) {
                    const currentUser = session?.user ?? null;
                    setUser(currentUser);
                    cacheUserSession(currentUser);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error getting session:', error);
                if (isMounted) {
                    // If offline or error, use cached session
                    const cachedUser = getCachedSession();
                    if (cachedUser) {
                        setUser(cachedUser);
                    }
                    setLoading(false);
                }
            }
        };

        // Set a timeout to prevent indefinite loading
        const timeout = setTimeout(() => {
            if (isMounted && loading) {
                console.warn('Session check timeout, using cached session');
                const cachedUser = getCachedSession();
                if (cachedUser) {
                    setUser(cachedUser);
                }
                setLoading(false);
            }
        }, 5000); // 5 second timeout

        initSession();

        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (isMounted) {
                const currentUser = session?.user ?? null;
                setUser(currentUser);
                cacheUserSession(currentUser);
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            subscription.unsubscribe();
        };
    }, []);

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: async (data) => {
            const result = await supabase.auth.signInWithPassword(data);
            if (result.data?.user) {
                cacheUserSession(result.data.user);
            }
            return result;
        },
        signOut: async () => {
            cacheUserSession(null);
            return supabase.auth.signOut();
        },
        loginAsDemo: async () => {
            // SECURITY FIX: Use anonymous auth to give each demo user an isolated session.
            // This prevents data leakage between demo users and removes hardcoded credentials.
            try {
                const { data, error } = await supabase.auth.signInAnonymously();

                if (error) throw error;

                if (data?.user) {
                    // Seed demo data for this new isolated anonymous user
                    if (data.session) {
                        await seedDemoData(data.user.id);
                    }
                    cacheUserSession(data.user);
                    return { data };
                }

                throw new Error("Échec connexion démo anonyme");

            } catch (error) {
                console.error("Demo login error:", error);

                // Fallback: local UI-only demo (no database access)
                const fakeUser = {
                    id: 'demo-local-fallback',
                    email: 'demo@local',
                    user_metadata: { full_name: 'Mode Démo (Hors Ligne)', job_type: 'peintre' },
                    aud: 'authenticated',
                    role: 'authenticated'
                };
                setUser(fakeUser);
                cacheUserSession(fakeUser);
                return { data: { user: fakeUser } };
            }
        },
        user,
        isOffline,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
