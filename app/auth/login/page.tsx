"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc"; // Import Google icon

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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-6 shadow-lg">
        <h1 className="text-3xl font-bold text-center text-gray-800">Login</h1>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        
        {/* Email & Password Fields */}
        <input
          type="email"
          placeholder="Email"
          className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Login Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="w-full flex justify-center items-center p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : "Login"}
        </button>

        {/* Google Login Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            handleGoogleLogin();
          }}
          className="w-full flex items-center justify-center p-3 border rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              <FcGoogle className="text-xl mr-2" /> Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
