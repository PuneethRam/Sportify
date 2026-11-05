"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for Firebase to restore a saved sign-in before deciding: on a page
    // reload `user` is null for a moment even when the user is signed in.
    if (!loading && user === null) {
      router.push("/"); // Redirect to login if not authenticated
    }
  }, [user, loading, router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen text-lg">
        {loading ? "Loading..." : "Redirecting to login..."}
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
