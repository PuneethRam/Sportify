"use client";

import React from "react";
import { Users, Trophy, Calendar, Medal, TrendingUp } from "lucide-react";
import Link from "next/link";

const features = [
  {
    name: "Clan Members",
    icon: Users,
    description: "View and manage clan members",
    color: "bg-blue-500 dark:bg-blue-600",
  },
  {
    name: "Matches",
    icon: Calendar,
    description: "Schedule and view match history",
    color: "bg-green-500 dark:bg-green-600",
  },
  {
    name: "clanLeaderboard",
    icon: Trophy,
    description: "Check clan rankings and statistics",
    color: "bg-yellow-500 dark:bg-yellow-600",
  },
  {
    name: "Tournaments",
    icon: Medal,
    description: "Participate in tournaments",
    color: "bg-purple-500 dark:bg-purple-600",
  },
  {
    name: "Series Matches",
    icon: TrendingUp,
    description: "View series matches and progress",
    color: "bg-indigo-500 dark:bg-indigo-600",
  },
];

const ClanDetails = () => {
  // Static Placeholder Data (Replace with API Data in Future)
  const clan = {
    id: "1",
    name: "Elite Shuttlers",
    rank: 3,
    image: "https://images.unsplash.com/photo-1626224583764-f0e282c5cb50?w=800&auto=format&fit=crop&q=60",
  };

  return (
    <div className="space-y-8">
      {/* Clan Banner */}
      <div className="relative h-48 rounded-xl overflow-hidden">
        <img src={clan.image} alt={clan.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 text-white">
          <h1 className="text-3xl font-bold">{clan.name}</h1>
          <p className="text-lg opacity-90">Global Rank #{clan.rank}</p>
        </div>
      </div>

      {/* Feature Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => (
          <Link
          key={feature.name}
          href={`/clan/${feature.name.toLowerCase().replace(/\s+/g, "-")}`}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow text-left"
        >
          <div className={`inline-flex p-3 rounded-lg ${feature.color} text-white mb-4`}>
            <feature.icon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2 dark:text-white">{feature.name}</h3>
          <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
        </Link>
        ))}
      </div>
    </div>
  );
};

export default ClanDetails;
