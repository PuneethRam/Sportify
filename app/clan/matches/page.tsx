"use client";

import React, { useState } from 'react';
import { Users2, User, Clock, Trophy } from 'lucide-react';

type Match = {
  id: string;
  type: 'singles' | 'doubles';
  status: 'live' | 'scheduled' | 'completed';
  players: {
    team1: string[];
    team2: string[];
  };
  scores?: {
    team1: number[];
    team2: number[];
  };
  scheduledTime?: string;
};

const sampleMatches: Match[] = [
  {
    id: '1',
    type: 'singles',
    status: 'live',
    players: {
      team1: ['Lee Zii Jia'],
      team2: ['Viktor Axelsen']
    },
    scores: {
      team1: [21, 19, 15],
      team2: [19, 21, 12]
    }
  },
  {
    id: '2',
    type: 'doubles',
    status: 'scheduled',
    players: {
      team1: ['Marcus Fernaldi Gideon', 'Kevin Sanjaya Sukamuljo'],
      team2: ['Mohammad Ahsan', 'Hendra Setiawan']
    },
    scheduledTime: '2024-03-20T14:30:00Z'
  },
  {
    id: '3',
    type: 'singles',
    status: 'completed',
    players: {
      team1: ['An Se-young'],
      team2: ['Akane Yamaguchi']
    },
    scores: {
      team1: [21, 21],
      team2: [19, 18]
    }
  }
];

function MatchCard({ match }: { match: Match }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {match.type === 'singles' ? (
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          ) : (
            <Users2 className="w-5 h-5 text-green-600 dark:text-green-400" />
          )}
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {match.type.charAt(0).toUpperCase() + match.type.slice(1)}
          </span>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          match.status === 'live' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
          match.status === 'scheduled' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
        }`}>
          {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            {match.players.team1.map((player, idx) => (
              <div key={idx} className="font-medium text-gray-900 dark:text-gray-100">{player}</div>
            ))}
          </div>
          {match.scores && (
            <div className="flex gap-2">
              {match.scores.team1.map((score, idx) => (
                <span key={idx} className="font-bold text-lg text-gray-900 dark:text-gray-100">{score}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <div className="flex-1">
            {match.players.team2.map((player, idx) => (
              <div key={idx} className="font-medium text-gray-900 dark:text-gray-100">{player}</div>
            ))}
          </div>
          {match.scores && (
            <div className="flex gap-2">
              {match.scores.team2.map((score, idx) => (
                <span key={idx} className="font-bold text-lg text-gray-900 dark:text-gray-100">{score}</span>
              ))}
            </div>
          )}
        </div>

        {match.scheduledTime && (
          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            {new Date(match.scheduledTime).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'upcoming' | 'recent'>('live');

  const filteredMatches = sampleMatches.filter(match => {
    if (activeTab === 'live') return match.status === 'live';
    if (activeTab === 'upcoming') return match.status === 'scheduled';
    return match.status === 'completed';
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('live')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'live'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              Live Matches
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'upcoming'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              Upcoming Matches
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'recent'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              Recent Matches
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {filteredMatches.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No matches found</h3>
            <p className="text-gray-500 dark:text-gray-400">Check back later for updates</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMatches.map(match => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;