"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import Cookies from "js-cookie";
import { jwtDecode } from "jwt-decode";
import type { LoginResponse } from "@/lib/types";

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
  iat: number;
}

export interface AuthUser {
  email: string;
  role: string;
  userId: number;
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (data: LoginResponse) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get("token");
    if (token) {
      try {
        const decoded = jwtDecode<JwtPayload>(token);
        if (decoded.exp * 1000 > Date.now()) {
          const userId = Number(Cookies.get("userId") || "0");
          const role = decoded.role;
          setUser({ email: decoded.sub, role, userId, token });
        } else {
          Cookies.remove("token");
          Cookies.remove("userId");
          Cookies.remove("role");
        }
      } catch {
        Cookies.remove("token");
        Cookies.remove("userId");
        Cookies.remove("role");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((data: LoginResponse) => {
    Cookies.set("token", data.token, { expires: 1 });
    Cookies.set("userId", String(data.userId), { expires: 1 });
    Cookies.set("role", data.role, { expires: 1 });
    setUser({
      email: data.email,
      role: data.role,
      userId: data.userId,
      token: data.token,
    });
  }, []);

  const logout = useCallback(() => {
    Cookies.remove("token");
    Cookies.remove("userId");
    Cookies.remove("role");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
