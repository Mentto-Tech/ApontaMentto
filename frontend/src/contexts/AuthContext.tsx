import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch, getToken, removeToken, setToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  hourlyRate?: number | null;
  overtimeHourlyRate?: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface TokenResponse {
  access_token: string;
  user: AuthUser;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from stored JWT on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiFetch<AuthUser>("/api/auth/me")
      .then(u => setUser(u))
      .catch(() => removeToken())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(data.access_token);
      setUser(data.user);
      return true;
    } catch {
      return false;
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/register", {
        method: "POST",
        body: { name, email, password },
      });
      setToken(data.access_token);
      setUser(data.user);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const u = await apiFetch<AuthUser>("/api/auth/me");
      setUser(u);
    } catch {
      removeToken();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      signup,
      logout,
      isAdmin: user?.role === 'admin',
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
};
