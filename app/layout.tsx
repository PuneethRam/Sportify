"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation"; 
import { LucideHome, LucidePlusCircle, LucideLineChart, LucideBarChart2, LucideSun, LucideMoon, LucideLogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WalletProvider } from "@/context/WalletContext";

function NavContent() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check for saved theme preference or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const newMode = !prev;
      localStorage.setItem('theme', newMode ? 'dark' : 'light');
      
      if (newMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return newMode;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <>
      <div className="hidden md:flex items-center justify-between p-4">
        <h1 className="text-xl font-bold">Energy Trade</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <LucideSun className="w-5 h-5" /> : <LucideMoon className="w-5 h-5" />}
          </button>
          
          {user && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-red-500 dark:text-red-400"
              aria-label="Logout"
            >
              <LucideLogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex md:flex-col justify-around md:justify-start w-full p-2 md:p-4 space-y-0 md:space-y-2">
        <Link href="/dashboard" className="nav-link flex items-center p-2 rounded-lg">
          <LucideHome className="w-5 h-5" />
          <span className="hidden md:inline ml-3">Dashboard</span>
        </Link>
        <Link href="/clans" className="nav-link flex items-center p-2 rounded-lg">
          <LucideBarChart2 className="w-5 h-5" />
          <span className="hidden md:inline ml-3">Clan</span>
        </Link>
        
        {/* Mobile-only logout button */}
        {user && (
          <button 
            onClick={handleLogout}
            className="md:hidden nav-link flex items-center p-2 rounded-lg text-red-500 dark:text-red-400"
          >
            <LucideLogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // For auth pages, use a simpler layout without navigation
  if (pathname === "/" || pathname === "/auth/login" || pathname === "/auth/signup") {
    return (
      <html lang="en">
        <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
          <AuthProvider>
              {children}
          </AuthProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <AuthProvider>
          <WalletProvider>
            <nav className="fixed bottom-0 left-0 w-full bg-white dark:bg-gray-800 md:w-64 md:h-screen md:fixed md:left-0 md:top-0 border-t md:border-r border-gray-200 dark:border-gray-700">
              <div className="flex md:flex-col h-full">
                <NavContent />
              </div>
            </nav>

            <main className="md:ml-64 p-4">{children}</main>
          </WalletProvider>
        </AuthProvider>
      </body>
    </html>
  );
}