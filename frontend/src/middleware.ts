import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  sub: string;
  role: string;
  exp: number;
}

const ROLE_DASHBOARDS: Record<string, string> = {
  admin: "/admin",
  doctor: "/doctor",
  radiologist: "/radiologist",
  lab_staff: "/lab-staff",
  patient: "/patient",
};

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // Public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    if (token) {
      try {
        const { role, exp } = jwtDecode<JwtPayload>(token);
        if (exp * 1000 > Date.now()) {
          return NextResponse.redirect(
            new URL(ROLE_DASHBOARDS[role] || "/login", request.url),
          );
        }
      } catch {
        // Invalid token, let them through to login
      }
    }
    return NextResponse.next();
  }

  // Root page -> redirect
  if (pathname === "/") {
    if (token) {
      try {
        const { role, exp } = jwtDecode<JwtPayload>(token);
        if (exp * 1000 > Date.now()) {
          return NextResponse.redirect(
            new URL(ROLE_DASHBOARDS[role] || "/login", request.url),
          );
        }
      } catch {
        // fall through
      }
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // All other routes require authentication
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { role, exp } = jwtDecode<JwtPayload>(token);
    if (exp * 1000 < Date.now()) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("token");
      response.cookies.delete("userId");
      response.cookies.delete("role");
      return response;
    }

    // Role-based route enforcement
    const allowedPrefix = ROLE_DASHBOARDS[role];
    if (allowedPrefix && !pathname.startsWith(allowedPrefix)) {
      return NextResponse.redirect(new URL(allowedPrefix, request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
