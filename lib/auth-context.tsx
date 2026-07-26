"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiClient, type User, type AuthTokens, type LoginRequest, type RegisterRequest } from "./api";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  loginWithTokens: (tokens: AuthTokens) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The access and refresh tokens are NOT persisted here. The API sets them as
// HttpOnly cookies that page script cannot read, which is the whole point: an
// XSS bug on any page can no longer steal a working session. We keep the access
// token in memory for the lifetime of the tab (so explicit Authorization
// headers still work), and only the non-secret expiry timestamp on disk, so the
// refresh timer survives a reload.
const TOKEN_EXPIRY_KEY = "csedu_token_expiry";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const saveTokens = useCallback((tokens: AuthTokens) => {
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + tokens.expires_in * 1000));
    apiClient.setAccessToken(tokens.access_token);
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    apiClient.setAccessToken(null);
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch {
      // For development: Create mock user if API fails and mock mode is enabled
      const useMockMode = localStorage.getItem('use_mock_mode') === 'true';
      if (process.env.NODE_ENV === 'development' && useMockMode) {
        // Get selected role from localStorage or default to student
        const selectedRole = localStorage.getItem('mock_role') || 'student';

        const mockUsers: Record<string, any> = {
          public: {
            user_id: "mock-public-123",
            email: "public@gmail.com",
            name: "Public User",
            role_tier: "public" as const,
            created_at: new Date().toISOString(),
            last_login: null
          },
          student: {
            user_id: "mock-student-123",
            email: "student@cs.du.ac.bd",
            name: "Student User",
            role_tier: "student" as const,
            created_at: new Date().toISOString(),
            last_login: null
          },
          researcher: {
            user_id: "mock-researcher-123",
            email: "researcher@cs.du.ac.bd",
            name: "Faculty Researcher",
            role_tier: "researcher" as const,
            created_at: new Date().toISOString(),
            last_login: null
          },
          librarian: {
            user_id: "mock-librarian-123",
            email: "librarian@cs.du.ac.bd",
            name: "Head Librarian",
            role_tier: "librarian" as const,
            created_at: new Date().toISOString(),
            last_login: null
          },
          administrator: {
            user_id: "mock-admin-123",
            email: "admin@cs.du.ac.bd",
            name: "Platform Admin",
            role_tier: "administrator" as const,
            created_at: new Date().toISOString(),
            last_login: null
          }
        };

        const mockUser = mockUsers[selectedRole] || mockUsers.student;
        setUser(mockUser);
      } else {
        setUser(null);
      }
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      // Empty string: the server falls back to the HttpOnly refresh cookie,
      // which is the only copy of the refresh token the browser now holds.
      const tokens = await apiClient.refreshToken("");
      saveTokens(tokens);
      await loadUser();
    } catch {
      clearTokens();
      setUser(null);
    }
  }, [clearTokens, saveTokens, loadUser]);

  useEffect(() => {
    const initAuth = async () => {
      // On a fresh page load the in-memory token is gone, but the session
      // cookie is not — so ask the API who we are whenever a session looks
      // plausible. The expiry stamp is the marker that a login happened; an
      // anonymous visitor has none and we skip the call, so public pages do not
      // fire a pointless 401 on every load.
      const hasSession = localStorage.getItem(TOKEN_EXPIRY_KEY) !== null;
      if (hasSession || localStorage.getItem('use_mock_mode') === 'true') {
        await loadUser();
      }
      setIsLoading(false);
    };

    initAuth();
  }, [loadUser]);

  // Set up token refresh interval
  useEffect(() => {
    const interval = setInterval(() => {
      const tokenExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
      if (tokenExpiry) {
        const expiryTime = parseInt(tokenExpiry);
        // Refresh 5 minutes before expiry
        if (Date.now() > expiryTime - 5 * 60 * 1000) {
          refreshAuth();
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [refreshAuth]);

  const login = useCallback(async (data: LoginRequest) => {
    const tokens = await apiClient.login(data);
    saveTokens(tokens);
    await loadUser();
  }, [saveTokens, loadUser]);

  // Used by the Google OAuth callback: tokens are already minted server-side
  // and delivered via the URL fragment, so we just persist and load the user.
  const loginWithTokens = useCallback(async (tokens: AuthTokens) => {
    saveTokens(tokens);
    await loadUser();
  }, [saveTokens, loadUser]);

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await apiClient.register(data);
    saveTokens(response.tokens);
    setUser(response.user);
  }, [saveTokens]);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignore logout errors
    }
    clearTokens();
    setUser(null);
  }, [clearTokens]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithTokens,
        register,
        logout,
        refreshAuth,
        refreshUser: loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
