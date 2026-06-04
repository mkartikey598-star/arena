"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const BACKEND = "http://localhost:8080"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${BACKEND}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        localStorage.setItem("token", data.token)
        localStorage.setItem("username", data.username)
        router.push("/")
      }
    } catch {
      setError("Couldn't reach the server.")
    }
    setLoading(false)
  }

  return (
    <main className="bg-black text-white min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[360px] px-6">

        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-[17px] font-semibold tracking-tight">Coding Arena</span>
        </div>

        <h1 className="text-2xl font-semibold mb-1 text-center">Welcome back</h1>
        <p className="text-white/40 text-sm text-center mb-8">Sign in to your account</p>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3
              text-[14px] text-white placeholder-white/25 outline-none
              focus:border-white/30 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3
              text-[14px] text-white placeholder-white/25 outline-none
              focus:border-white/30 transition-colors"
          />
        </div>

        {error && (
          <p className="text-red-400/80 text-[12px] mt-3 text-center">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !username || !password}
          className="w-full mt-4 py-3 bg-white text-black text-[14px] font-medium rounded-xl
            hover:opacity-85 transition-all active:scale-95 disabled:opacity-40">
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-[13px] text-white/40 mt-4">
          Don't have an account?{" "}
          <a href="/register" className="text-white hover:opacity-70 transition-opacity">
            Register
          </a>
        </p>

      </div>
    </main>
  )
}