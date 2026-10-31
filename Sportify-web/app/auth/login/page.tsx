"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2,ChevronRight, CheckCircle } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

export default function LoginPage() {
  const { login, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (error) {
      console.log(error);
      setError("Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (error) {
      console.log(error);
      setError("Google login failed. Try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500 mb-2">
            Sportify
          </div>
          <p className="text-gray-600 dark:text-gray-300">Sign in to continue your sports journey</p>
        </div>
        
        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
          {/* Decorative Header */}
          <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500"></div>
          
          <div className="p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-300 text-sm">
                {error}
              </div>
            )}
            
            {/* Email Field */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                placeholder="your.email@example.com"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            {/* Password Field */}
            <div className="mb-6">
              <div className="flex justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <a href="/auth/forgot-password" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Forgot password?</a>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            {/* Login Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="w-full flex justify-center items-center p-3 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg shadow transition disabled:opacity-70"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2" size={20} />
              ) : (
                <>
                  Sign In
                  <ChevronRight className="ml-2" size={18} />
                </>
              )}
            </button>
            
            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
              <span className="px-4 text-sm text-gray-500 dark:text-gray-400">or continue with</span>
              <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            </div>
            
            {/* Google Login Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                handleGoogleLogin();
              }}
              className="w-full flex items-center justify-center p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-650 shadow-sm transition disabled:opacity-70"
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <FcGoogle className="text-xl mr-2" />
                  <span className="text-gray-800 dark:text-gray-200">Sign in with Google</span>
                </>
              )}
            </button>
            
            {/* Registration Link */}
            <div className="mt-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                Don&apos;t have an account yet?{" "}
                <a 
                  href="/auth/signup" 
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  Create account
                </a>
              </p>
            </div>
          </div>
        </div>
        
        {/* Features Highlight */}
        <div className="mt-8">
          <div className="flex flex-col md:flex-row justify-center gap-4 text-sm">
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Create or join clans
            </div>
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Track clan performance
            </div>
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Compete in tournaments
            </div>
          </div>
        </div>
        
        {/* Decorative Elements */}
        <div className="absolute top-12 left-12 w-32 h-32 bg-blue-300 dark:bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute bottom-12 right-12 w-32 h-32 bg-green-300 dark:bg-green-700 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      </div>
    </div>
  );
}