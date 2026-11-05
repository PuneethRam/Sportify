"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Sun, Moon, LogOut, Zap, Handshake, Building2, Bell, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { href: "/dashboard",   label: "Dashboard",   short: "Home",    icon: LayoutDashboard, also: [] as string[] },
  { href: "/clans",       label: "Clans",       short: "Clans",   icon: Users,           also: [] as string[] },
  { href: "/academy",     label: "Academy",     short: "Academy", icon: Building2,       also: ["/org"] },
  { href: "/find-a-mate", label: "Find a Mate", short: "Find",    icon: Handshake,       also: [] as string[] },
];

function NavContent() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved !== "light";
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem("theme", next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const handleLogout = async () => {
    try { await logout(); router.push("/"); } catch (e) { console.error(e); }
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* ── Mobile top header ── */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-white dark:bg-[#080A1A] border-b border-slate-200 dark:border-white/8 flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-glow-blue-sm">
            <Zap className="w-4 h-4 fill-white text-white" />
          </div>
          <span className="display-font font-bold text-xl tracking-wide text-slate-900 dark:text-white">
            SPORT<span className="text-blue-600 dark:text-blue-400">IFY</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleDarkMode} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors" aria-label="Toggle theme">
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
          {user && (
            <Link href="/settings/notifications" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors" aria-label="Notification settings">
              <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </Link>
          )}
          {user && (
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors" aria-label="Sign out">
              <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop sidebar content ── */}
      <div className="hidden md:flex flex-col h-full">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-glow-blue-sm flex-shrink-0">
              <Zap className="w-5 h-5 fill-white text-white" />
            </div>
            <span className="display-font font-bold text-2xl tracking-wide text-white">
              SPORT<span className="text-blue-400">IFY</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 pl-0.5 tracking-wide">Compete · Track · Dominate</p>
        </div>

        {/* User chip */}
        {user && (
          <div className="mx-3 mb-4 p-3 rounded-xl bg-white/4 border border-blue-900/40 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-glow-blue-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.displayName || user.email?.split("@")[0]}</p>
              <p className="text-xs text-slate-500 mt-0.5">Member</p>
            </div>
          </div>
        )}

        <div className="mx-4 border-t border-white/6 mb-3" />

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV_LINKS.map(({ href, label, icon: Icon, also }) => {
            const active = pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href)) ||
              also.some(p => pathname.startsWith(p));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  active ? "nav-active" : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon style={{ width: 17, height: 17, flexShrink: 0 }} className={active ? "text-blue-300" : "group-hover:text-white"} />
                <span>{label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shadow-glow-blue-sm" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="mx-3 mb-5">
          <div className="border-t border-white/6 mb-3" />
          <div className="space-y-1">
            <button
              onClick={toggleDarkMode}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              {darkMode
                ? <><Sun style={{width:16,height:16,flexShrink:0}} className="text-amber-400" /><span>Light Mode</span></>
                : <><Moon style={{width:16,height:16,flexShrink:0}} /><span>Dark Mode</span></>}
            </button>
            {user && (
              <Link
                href="/settings/notifications"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith("/settings") ? "nav-active" : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Bell style={{width:16,height:16,flexShrink:0}} />
                <span>Notifications</span>
              </Link>
            )}
            {user && (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 transition-all"
              >
                <LogOut style={{width:16,height:16,flexShrink:0}} />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <div className="flex md:hidden items-center w-full">
        {NAV_LINKS.map(({ href, short, icon: Icon, also }) => {
          const active = pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href)) ||
            also.some(p => pathname.startsWith(p));
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
              }`}>
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide">{short}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/**
 * Pages read auth.currentUser / call fetchWithAuth as soon as they mount. On a
 * reload or a direct link Firebase hasn't restored the sign-in yet, so hold
 * the page until it has; otherwise the page loads empty or bounces to "/".
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex justify-center py-24" aria-label="Loading">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/" || pathname === "/auth/login" || pathname === "/auth/signup" || pathname.startsWith("/i/") || pathname.startsWith("/s/");

  if (isAuth) {
    return (
      <html lang="en">
        <body className="bg-[#050611] text-slate-100">
          <AuthProvider>
            <div className="relative min-h-screen overflow-hidden">
              <div className="absolute top-12 left-12 w-40 h-40 bg-blue-700 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob" />
              <div className="absolute bottom-12 right-12 w-40 h-40 bg-teal-800 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
              {children}
            </div>
          </AuthProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-background text-slate-900 dark:text-slate-100 transition-colors">
        <AuthProvider>
          {/* Sidebar — desktop left, mobile bottom */}
          <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#080A1A] border-t border-slate-200 dark:border-white/8 md:inset-y-0 md:left-0 md:right-auto md:w-64 md:bg-[#080A1A] md:border-t-0 md:border-r md:border-white/6 z-50 shadow-sport">
            <div className="flex md:flex-col h-full">
              <NavContent />
            </div>
          </nav>
          <main className="md:ml-64 pt-14 md:pt-0 pb-24 md:pb-0 min-h-screen">
            <div className="p-4 md:p-6 max-w-7xl mx-auto">
              <AuthGate>{children}</AuthGate>
            </div>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
