"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const BACKEND = "http://localhost:8080"

interface Stats {
  username: string
  games_played: number
  wins: number
}

export default function ProfilePage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    const username = localStorage.getItem("username")
    if (!token || !username) {
      router.push("/login")
      return
    }

    fetch(`${BACKEND}/me/stats?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          router.push("/login")
        } else {
          setStats(data)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  if (loading) return (
    <div className="bg-black min-h-screen flex items-center justify-center">
      <div className="flex gap-2">
        {[0,1,2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-white/30 animate-pulse"
            style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )

  if (!stats) return null

  const winRate = stats.games_played > 0
    ? Math.round((stats.wins / stats.games_played) * 100)
    : 0

  return (
    <main className="bg-black text-white min-h-screen">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/[0.08]">
        <a href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Coding Arena
        </a>
        <button
          onClick={() => {
            localStorage.removeItem("token")
            localStorage.removeItem("username")
            router.push("/")
          }}
          className="text-[13px] font-medium px-[18px] py-2 border border-white/20 text-white/70 rounded-full hover:opacity-80 transition-all">
          Sign out
        </button>
      </nav>

      <div className="max-w-[600px] mx-auto px-6 pt-16">
        <div className="flex items-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-bold">
            {stats.username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{stats.username}</h1>
            <p className="text-white/40 text-sm">Arena player</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "Games Played", value: stats.games_played },
            { label: "Wins", value: stats.wins },
            { label: "Win Rate", value: `${winRate}%` },
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold mb-1">{stat.value}</p>
              <p className="text-[11px] text-white/40 uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[11px] text-white/25 uppercase tracking-wide mb-3">Recent Games</p>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 text-center">
            <p className="text-white/30 text-sm">
              {stats.games_played === 0 ? "No games yet — go play!" : "Match history coming soon"}
            </p>
            <a href="/" className="mt-3 inline-block text-[13px] text-white/60 hover:text-white transition-colors">
              Back to lobby →
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}