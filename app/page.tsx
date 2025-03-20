"use client";

import React from "react";
import { useRouter } from "next/navigation"; // ✅ Import useRouter for navigation

const LandingPage: React.FC = () => {
  const router = useRouter(); // ✅ Hook for navigation

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-20 px-6">
        <h1 className="text-4xl font-bold mb-4">Decentralized Peer-to-Peer Energy Trading</h1>
        <p className="text-lg mb-6 max-w-2xl">
          Buy and sell energy directly with peers using blockchain-powered smart contracts. Take control of your energy trading today!
        </p>
        <div className="flex space-x-4">
          <button 
            onClick={() => router.push("/auth/signup")}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
          >
            Sign Up
          </button>
          <button 
            onClick={() => router.push("/auth/login")}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
          >
            Login
          </button>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-16 px-6 bg-white dark:bg-gray-800 text-center">
        <h2 className="text-3xl font-semibold mb-8">Why Choose Us?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 bg-gray-200 dark:bg-gray-700 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2">Transparent Pricing</h3>
            <p>Smart contracts ensure fair and transparent energy trading.</p>
          </div>
          <div className="p-6 bg-gray-200 dark:bg-gray-700 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2">Real-time Analytics</h3>
            <p>Track market trends and optimize your trades using AI-driven insights.</p>
          </div>
          <div className="p-6 bg-gray-200 dark:bg-gray-700 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2">Secure Transactions</h3>
            <p>Built on blockchain for secure, decentralized, and reliable transactions.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
