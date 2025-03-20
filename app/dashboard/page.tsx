"use client";

import React from 'react';
import { Trophy, Calendar, Star, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

const mockProfile = {
  name: "Alex Chen",
  globalPoints: 2750,
  rank: 15,
  matches: [
    { id: "1", date: "2024-03-10", opponent: "Sarah Smith", score: "21-19, 21-15", result: "win", points: 25 },
    { id: "2", date: "2024-03-08", opponent: "Mike Johnson", score: "19-21, 21-18, 21-15", result: "win", points: 30 },
    { id: "3", date: "2024-03-05", opponent: "Lisa Wong", score: "21-15, 18-21, 19-21", result: "loss", points: -15 }
  ],
  clans: [
    { id: "1", name: "Elite Shuttlers", memberCount: 25, rank: 3, image: "https://images.unsplash.com/photo-1626224583764-f0e282c5cb50?w=800&auto=format&fit=crop&q=60" },
    { id: "2", name: "Power Smashers", memberCount: 18, rank: 7, image: "https://images.unsplash.com/photo-1626224583764-f0e282c5cb50?w=800&auto=format&fit=crop&q=60" }
  ]
} as const;

const Profile = () => {
  return (
    <div className="space-y-8">
      {/* Stats Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center space-x-4 p-4 bg-indigo-50 dark:bg-indigo-900/50 rounded-lg">
            <Trophy className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Global Points</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{mockProfile.globalPoints}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-4 bg-green-50 dark:bg-green-900/50 rounded-lg">
            <Star className="w-8 h-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Global Rank</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">#{mockProfile.rank}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 p-4 bg-purple-50 dark:bg-purple-900/50 rounded-lg">
            <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Win Rate</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">67%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Matches */}
      <div>
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Recent Matches</h2>
        <div className="space-y-4">
          {mockProfile.matches.map((match) => (
            <div key={match.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <div>
                    <p className="font-medium dark:text-white">vs {match.opponent}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{match.score}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={clsx(
                    'text-sm font-medium px-2.5 py-0.5 rounded-full',
                    match.result === 'win' 
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400' 
                      : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-400'
                  )}>
                    {match.result.toUpperCase()}
                  </span>
                  <span className={clsx(
                    'text-sm font-medium',
                    match.points > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  )}>
                    {match.points > 0 ? '+' : ''}{match.points}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Clans */}
      <div>
        <h2 className="text-xl font-semibold mb-4 dark:text-white">My Clans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockProfile.clans.map((clan) => (
            <div key={clan.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="h-32 w-full relative">
                <img src={clan.image} alt={clan.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <p className="font-semibold text-lg">{clan.name}</p>
                  <p className="text-sm opacity-90">Rank #{clan.rank}</p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">{clan.memberCount} members</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Profile;