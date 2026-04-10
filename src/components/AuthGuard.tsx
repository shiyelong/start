"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LogIn, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

/**
 * AuthGuard — wraps protected page content.
 *
 * - While checking auth state: shows a brief loading spinner.
 * - If not logged in: shows a "请登录" prompt with a link to /login?redirect=<current path>.
 * - If logged in: renders children normally.
 *
 * Usage:
 *   <AuthGuard>
 *     <YourPageContent />
 *   </AuthGuard>
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);

  // Wait for client-side hydration so we can read localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Loading state while hydrating
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#3ea6ff]" />
      </div>
    );
  }

  // Not logged in — show login prompt
  if (!isLoggedIn) {
    const loginUrl = `/login?redirect=${encodeURIComponent(pathname)}`;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="w-16 h-16 rounded-full bg-[#212121] flex items-center justify-center">
          <LogIn className="w-8 h-8 text-[#3ea6ff]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-white">请登录</h2>
          <p className="text-sm text-[#8a8a8a]">
            登录后即可访问此页面的全部内容
          </p>
        </div>
        <Link
          href={loginUrl}
          className="px-6 py-2.5 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-sm font-semibold hover:bg-[#65b8ff] transition"
        >
          去登录
        </Link>
      </div>
    );
  }

  // Logged in — render children
  return <>{children}</>;
}
