"use client";

import React from 'react';
import { Plus, UserPlus, Users, Trophy, Calendar, TrendingUp, Medal } from 'lucide-react';
import Link from "next/link";

const mockClans = [
  {
    id: "1",
    name: "Elite Shuttlers",
    memberCount: 25,
    rank: 3,
    image: "https://images.unsplash.com/photo-1626224583764-f0e282c5cb50?w=800&auto=format&fit=crop&q=60"
  },
  {
    id: "2",
    name: "Power Smashers",
    memberCount: 18,
    rank: 7,
    image: "https://images.unsplash.com/photo-1626224583764-f0e282c5cb50?w=800&auto=format&fit=crop&q=60"
  }
];

const features = [
  { name: 'Clan Members', icon: Users, color: 'text-blue-600 dark:text-blue-400' },
  { name: 'Matches', icon: Calendar, color: 'text-green-600 dark:text-green-400' },
  { name: 'Leaderboard', icon: Trophy, color: 'text-yellow-600 dark:text-yellow-400' },
  { name: 'Tournaments', icon: Medal, color: 'text-purple-600 dark:text-purple-400' },
  { name: 'Series Matches', icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400' },
];

const Clans = () => {
  return (
    <div className="space-y-8">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">
          <Plus className="w-4 h-4 mr-2" />
          Create Clan
        </button>
        <button className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
          <UserPlus className="w-4 h-4 mr-2" />
          Join Clan
        </button>
      </div>

      {/* My Clans */}
      <div>
        <h2 className="text-xl font-semibold mb-4 dark:text-white">My Clans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {mockClans.map((clan) => (
            <Link 
            href={`/clan/clandetails`} 
            key={clan.id} 
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="h-40 relative">
                <img src={clan.image} alt={clan.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="text-xl font-semibold">{clan.name}</h3>
                  <p className="text-sm opacity-90">Global Rank #{clan.rank}</p>
                </div>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {features.map((feature) => (
                    <div key={feature.name} className="text-center">
                      <feature.icon className={`w-6 h-6 mx-auto ${feature.color}`} />
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{feature.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Clans;