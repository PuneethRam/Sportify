"use client";

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Trophy, Search, ArrowLeft } from 'lucide-react';

type Player = {
  name: string;
  rank: number;
  points: number;
  wins: number;
  losses: number;
};

const mockPlayers: Player[] = [
  { name: 'John Doe', rank: 1, points: 2500, wins: 25, losses: 5 },
  { name: 'Jane Smith', rank: 2, points: 2400, wins: 22, losses: 7 },
  { name: 'Alice Johnson', rank: 3, points: 2350, wins: 20, losses: 8 },
  { name: 'Bob Wilson', rank: 4, points: 2200, wins: 18, losses: 10 },
  { name: 'Charlie Brown', rank: 5, points: 2150, wins: 17, losses: 11 },
];

const ClanLeaderboard = () => {
  const router = useRouter();
  const { id } = useParams();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlayers = mockPlayers.filter(player =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/clans/${id}`)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold dark:text-white">Clan Leaderboard</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center dark:text-white">
            <Trophy className="w-6 h-6 mr-2 text-yellow-500" />
            Rankings
          </h2>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="py-3 text-left">Rank</th>
                <th className="py-3 text-left">Player</th>
                <th className="py-3 text-right">Points</th>
                <th className="py-3 text-right">W/L</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => (
                <tr key={player.name} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="py-3">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full
                      ${player.rank <= 3 
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' 
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {player.rank}
                    </span>
                  </td>
                  <td className="py-3 font-medium dark:text-white">{player.name}</td>
                  <td className="py-3 text-right font-mono dark:text-white">{player.points}</td>
                  <td className="py-3 text-right">
                    <span className="text-green-600 dark:text-green-400">{player.wins}</span>
                    {' / '}
                    <span className="text-red-600 dark:text-red-400">{player.losses}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClanLeaderboard;
