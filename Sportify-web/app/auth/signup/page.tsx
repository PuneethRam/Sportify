"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { useRouter } from "next/navigation";
import { Loader2, ChevronRight, CheckCircle } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { nextPath, useWithNext } from "@/lib/nextPath";
import { track } from "@/lib/track";

export default function SignupPage() {
  const { signup, signInWithGoogle } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const switchLink = useWithNext("/auth/login");

  // Email/Password Signup
  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await signup(email, password);

      // Save user details in MySQL
      await fetchWithAuth("/api/addUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          email: email,
        }),
      });

      track("signup_completed", { method: "email" });
      router.push(nextPath());
    } catch (error) {
      console.log(error);
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Google Signup
  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    setError(null);
    
    try {
      const userCredential = await signInWithGoogle();
      const user = userCredential.user;

      // Save user details in MySQL (if first-time signup)
      await fetchWithAuth("/api/addUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.displayName || "Google User",
          email: user.email,
        }),
      });

      track("signup_completed", { method: "google" });
      router.push(nextPath());
    } catch (error) {
      console.log(error);
      setError((error as Error).message);
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
          <p className="text-gray-600 dark:text-gray-300">Create your account and start your sports journey</p>
        </div>
        
        {/* Signup Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
          {/* Decorative Header */}
          <div className="h-2 bg-gradient-to-r from-blue-600 to-green-500"></div>
          
          <div className="p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-300 text-sm">
                {error}
              </div>
            )}
            
            {/* Name Field */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input
                type="text"
                placeholder="John Doe"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Must be at least 8 characters with a number and special character
              </p>
            </div>
            
            {/* Signup Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                handleSignup();
              }}
              className="w-full flex justify-center items-center p-3 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg shadow transition disabled:opacity-70"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2" size={20} />
              ) : (
                <>
                  Create Account
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
            
            {/* Google Signup Button */}
            <button
              onClick={(e) => {
                e.preventDefault();
                handleGoogleSignup();
              }}
              className="w-full flex items-center justify-center p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-650 shadow-sm transition disabled:opacity-70"
              disabled={googleLoading}
            >
              {googleLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <FcGoogle className="text-xl mr-2" />
                  <span className="text-gray-800 dark:text-gray-200">Sign up with Google</span>
                </>
              )}
            </button>
            
            {/* Terms and Conditions */}
            <div className="mt-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                By creating an account, you agree to our{" "}
                <a href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</a> and{" "}
                <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</a>
              </p>
            </div>
          </div>
        </div>
        
        {/* Login Link */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <a 
              href={switchLink} 
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              Sign in
            </a>
          </p>
        </div>
        
        {/* Features Highlight */}
        <div className="mt-6">
          <div className="flex flex-col md:flex-row justify-center gap-4 text-sm">
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Free starter plan
            </div>
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Create your first clan
            </div>
            <div className="flex items-center text-gray-600 dark:text-gray-400">
              <CheckCircle className="mr-2 text-green-500" size={16} />
              Join tournaments
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