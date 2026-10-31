"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Trophy, Users, Calendar, Activity, CheckCircle } from "lucide-react";

const LandingPage: React.FC = () => {
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);


  // Handle scroll events for navbar styling
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-white">
      {/* Navbar */}
<nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? "bg-white dark:bg-gray-900 shadow-md py-2" : "bg-transparent py-4"}`}>
  <div className="container mx-auto px-6 flex items-center justify-between">
    <div className="flex items-center">
      <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">
        Sportify
      </div>
    </div>
    
    <div className="hidden md:flex items-center space-x-6">
      <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition">Features</a>
      <a href="#testimonials" className="hover:text-blue-600 dark:hover:text-blue-400 transition">Testimonials</a>
      <a href="#faq" className="hover:text-blue-600 dark:hover:text-blue-400 transition">FAQ</a>
      <button 
        onClick={() => router.push("/auth/login")}
        className="px-4 py-2 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
      >
        Login
      </button>
      <button 
        onClick={() => router.push("/auth/signup")}
        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg transition"
      >
        Sign Up
      </button>
    </div>
    
    <div className="md:hidden">
      <button 
        className="p-2"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
    </div>
  </div>
  
  {/* Mobile Menu */}
  {isMobileMenuOpen && (
    <div className="md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4 space-y-4">
        <a href="#features" className="block hover:text-blue-600 dark:hover:text-blue-400 transition">Features</a>
        <a href="#testimonials" className="block hover:text-blue-600 dark:hover:text-blue-400 transition">Testimonials</a>
        <a href="#faq" className="block hover:text-blue-600 dark:hover:text-blue-400 transition">FAQ</a>
        <div className="pt-4 space-y-3">
          <button 
            onClick={() => router.push("/auth/login")}
            className="w-full px-4 py-2 text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
          >
            Login
          </button>
          <button 
            onClick={() => router.push("/auth/signup")}
            className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg transition"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  )}
</nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="absolute h-full w-full bg-gradient-to-br from-blue-100 to-green-100 dark:from-blue-900/20 dark:to-green-900/20 opacity-50"></div>
          <div className="absolute w-96 h-96 -top-20 -left-20 bg-blue-500 dark:bg-blue-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute w-96 h-96 -bottom-20 right-1/3 bg-green-500 dark:bg-green-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute w-96 h-96 top-1/3 -right-20 bg-indigo-500 dark:bg-indigo-700 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center">
            <div className="w-full lg:w-1/2 mb-12 lg:mb-0">
              <div className="max-w-xl">
                <span className="inline-block py-1 px-3 mb-4 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full text-sm font-medium">Sports Management Made Easy</span>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                  Elevate Your <br/>
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">
                    Sporting Experience
                  </span>
                </h1>
                <p className="text-lg md:text-xl mb-8 text-gray-700 dark:text-gray-300">
                  Organize tournaments, track matches, form clans, and connect with fellow players. 
                  The all-in-one platform for sports enthusiasts.
                </p>
                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                  <button 
                    onClick={() => router.push("/auth/signup")}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
                  >
                    Get Started Free
                    <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                  </button>
                  <button 
                    onClick={() => router.push("/tour")}
                    className="px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 font-medium rounded-lg shadow hover:shadow-md transition-all"
                  >
                    Take a Tour
                  </button>
                </div>
                <div className="mt-8 flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <CheckCircle className="mr-2 text-green-500" size={16} />
                  No credit card required
                  <span className="mx-3">•</span>
                  <CheckCircle className="mr-2 text-green-500" size={16} />
                  Free forever plan available
                </div>
              </div>
            </div>
            
            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative w-full max-w-md">
                {/* Replace with actual app screenshot or illustration */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="h-12 bg-gray-100 dark:bg-gray-700 flex items-center px-4">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-4">
                      <h3 className="font-medium text-lg mb-2">Upcoming Tournament</h3>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-600 dark:text-gray-300">Badminton Masters 2025</span>
                        <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-sm px-2 py-1 rounded">Apr 15</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full overflow-hidden">
                        <div className="bg-green-500 h-full rounded-full" style={{ width: "70%" }}></div>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span>14/20 Players</span>
                        <span>Registration closing soon</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center bg-gray-50 dark:bg-gray-750 p-3 rounded-lg">
                        <Trophy className="text-yellow-500 mr-3" size={24} />
                        <div>
                          <p className="font-medium">You won your last match!</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">vs. Team Rocket - 21-19, 15-21, 21-18</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center bg-gray-50 dark:bg-gray-750 p-3 rounded-lg">
                        <Users className="text-blue-500 mr-3" size={24} />
                        <div>
                          <p className="font-medium">Your clan has a new member</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Sarah joined BirdHunters</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center bg-gray-50 dark:bg-gray-750 p-3 rounded-lg">
                        <Calendar className="text-purple-500 mr-3" size={24} />
                        <div>
                          <p className="font-medium">Practice session today</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">5:30 PM - Downtown Sports Center</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Decorative elements */}
                <div className="absolute -top-4 -right-4 w-20 h-20 bg-yellow-300 dark:bg-yellow-600 rounded-full opacity-30"></div>
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-blue-300 dark:bg-blue-600 rounded-full opacity-30"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="container mx-auto px-6 mt-24">
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
            <div className="flex items-center">
              <img src="/api/placeholder/120/40" alt="Brand logo" className="h-8 opacity-70 hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center">
              <img src="/api/placeholder/120/40" alt="Brand logo" className="h-8 opacity-70 hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center">
              <img src="/api/placeholder/120/40" alt="Brand logo" className="h-8 opacity-70 hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center">
              <img src="/api/placeholder/120/40" alt="Brand logo" className="h-8 opacity-70 hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center">
              <img src="/api/placeholder/120/40" alt="Brand logo" className="h-8 opacity-70 hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section id="features" className="py-20 bg-white dark:bg-gray-800">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block py-1 px-3 mb-4 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-full text-sm font-medium">Features</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need for your sports journey</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              From organizing tournaments to tracking your performance, Sportify has all the tools to take your game to the next level.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature Card 1 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Tournament Management</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Create and manage tournaments with ease. Set up brackets, track scores, and crown champions all in one place.
              </p>
            </div>
            
            {/* Feature Card 2 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                <Users className="text-green-600 dark:text-green-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Clan System</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Form or join clans with fellow players. Coordinate practice sessions, compete as a team, and climb the clan leaderboards.
              </p>
            </div>
            
            {/* Feature Card 3 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                <Calendar className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Event Scheduling</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Schedule matches, practices, and tournaments with conflict detection. Never double-book a court or miss a game again.
              </p>
            </div>
            
            {/* Feature Card 4 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-4">
                <Activity className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Performance Tracking</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Track your match history, win/loss ratio, and performance metrics. Use data to improve your strategy and technique.
              </p>
            </div>
            
            {/* Feature Card 5 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Community Forums</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Connect with the community, discuss strategies, share tips, and find practice partners in your area.
              </p>
            </div>
            
            {/* Feature Card 6 */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-600">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Secure & Private</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Control what you share with others. Your personal information is always protected with enterprise-grade security.
              </p>
            </div>
          </div>
          
          <div className="mt-16 text-center">
            <button 
              onClick={() => router.push("/features")}
              className="px-8 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-all inline-flex items-center"
            >
              Explore All Features
              <ChevronRight className="ml-2" size={20} />
            </button>
          </div>
        </div>
      </section>
      
      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block py-1 px-3 mb-4 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 rounded-full text-sm font-medium">Testimonials</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Loved by athletes everywhere</h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Don&apos;t just take our word for it — hear what players and organizers have to say about Sportify.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-full mr-4"></div>
                <div>
                  <h4 className="font-bold">Dhannush</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Player</p>
                </div>
              </div>
              <div className="flex mb-4 text-yellow-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
              &quot;It is super cool to create clans and compete among us.&quot;
              </p>
            </div> 

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-full mr-4"></div>
                <div>
                  <h4 className="font-bold">Michael Thompson</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Badminton Club Captain</p>
                </div>
              </div>
              <div className="flex mb-4 text-yellow-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
              &quot;Sportify has transformed how we manage our club tournaments. We have increased participation by 40% and saved countless hours on scheduling and scoring.&quot;
              </p>
            </div> 
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-full mr-4"></div>
                <div>
                  <h4 className="font-bold">Sunil</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Player</p>
                </div>
              </div>
              <div className="flex mb-4 text-yellow-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              </div>
              <p className="text-gray-600 dark:text-gray-300">
              &quot;Sportify has transformed how I play. It is awesome.&quot;
              </p>
            </div> 

          </div> 

          
        </div> 
         
      </section>  
    </div>
  );
};
    
export default LandingPage;