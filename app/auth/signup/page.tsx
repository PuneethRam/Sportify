"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { FcGoogle } from "react-icons/fc";

export default function SignupPage() {
  const { signup, signInWithGoogle } = useAuth(); // Ensure these functions exist in your AuthContext
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  // 🔹 Email/Password Signup
  const handleSignup = async () => {
    try {
      const userCredential = await signup(email, password);
      const user = userCredential.user;

      // Save user details in MySQL
      await fetch("/api/addUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          name: name,
          email: email,
        }),
      });

      router.push("/");
    } catch (error) {
      alert((error as Error).message);
    }
  };

  // 🔹 Google Signup
  const handleGoogleSignup = async () => {
    try {
      const userCredential = await signInWithGoogle();
      const user = userCredential.user;

      // Save user details in MySQL (if first-time signup)
      await fetch("/api/addUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          name: user.displayName || "Google User",
          email: user.email,
        }),
      });

      router.push("/");
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Signup</h1>

      {/* 🔹 Email & Password Signup */}
      <input
        type="text"
        placeholder="Name"
        className="w-full p-2 border rounded"
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="email"
        placeholder="Email"
        className="w-full p-2 border rounded"
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="w-full p-2 border rounded"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        onClick={handleSignup}
        className="w-full p-3 bg-blue-500 text-white rounded"
      >
        Signup
      </button>

      {/* 🔹 Google Signup Button */}
      <button
        onClick={handleGoogleSignup}
        className="w-full flex items-center justify-center p-3 border rounded text-gray-700 hover:bg-gray-100"
      >
        <FcGoogle className="mr-2 text-xl" />
        Sign up with Google
      </button>
    </div>
  );
}
