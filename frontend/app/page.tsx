"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"

type Panel = "idle" | "join"
type JoinStatus = "idle" | "checking" | "not_found" | "full" | "error"

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080"

export default function Home() {
  const router = useRouter()

  const [panel, setPanel] = useState<Panel>("idle")
  const [creating, setCreating] = useState(false)
  const [matching, setMatching] = useState(false)
  const [roomCode, setRoomCode] = useState("")
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle")
  const [joining, setJoining] = useState(false)
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "any">("any")
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    setUsername(localStorage.getItem("username"))
  }, [])

  const inputRef = useRef<HTMLInputElement>(null)
  const matchingRef = useRef(false)

  useEffect(() => {
    if (panel === "join") {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [panel])

  async function createRoom() {
    setCreating(true)
    try {
      const res = await fetch(`${BACKEND}/room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_name: "arena", difficulty }),
      })
      if (!res.ok) throw new Error("create failed")
      const data = await res.json()
      router.push(`/room/${data.room_id}`)
    } catch {
      setCreating(false)
    }
  }

  async function quickMatch() {
    if (matchingRef.current) return
    matchingRef.current = true
    setMatching(true)
    try {
      const res = await fetch(`${BACKEND}/queue`, { method: "POST" })
      const data = await res.json()
      if (data.room_id) router.push(`/room/${data.room_id}`)
      else {
        setMatching(false)
        matchingRef.current = false
      }
    } catch {
      setMatching(false)
      matchingRef.current = false
    }
  }

  function handleCodeChange(val: string) {
    const clean = val.replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 36)
    setRoomCode(clean)
    if (joinStatus !== "idle") setJoinStatus("idle")
  }

  async function joinRoom() {
    const code = roomCode.trim()
    if (!code) return
    setJoining(true)
    setJoinStatus("checking")
    try {
      const res = await fetch(`${BACKEND}/room/${code}`)
      if (res.status === 404) { setJoinStatus("not_found"); setJoining(false); return }
      if (!res.ok) { setJoinStatus("error"); setJoining(false); return }
      const data = await res.json()
      if (data.error) { setJoinStatus("not_found"); setJoining(false); return }
      if (data.players >= 2) { setJoinStatus("full"); setJoining(false); return }
      router.push(`/room/${data.room_id}`)
    } catch {
      setJoinStatus("error")
      setJoining(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") joinRoom()
    if (e.key === "Escape") resetJoin()
  }

  function resetJoin() {
    setPanel("idle")
    setRoomCode("")
    setJoinStatus("idle")
  }

  const statusMsg: Partial<Record<JoinStatus, string>> = {
    not_found: "Room not found — double-check the code.",
    full: "Room is full (2/2 players).",
    error: "Couldn't reach the server.",
  }
  const isError = statusMsg[joinStatus] !== undefined

  return (
    <main className="bg-black text-white min-h-screen font-sans overflow-hidden relative">
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-white opacity-[0.03] blur-3xl pointer-events-none" />
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          Coding Arena
        </div>
        <ul className="flex gap-7 list-none m-0 p-0">
          {["Features", "Rooms", "Replays"].map(item => (
            <li key={item}>
              <a href="#" className="text-[13px] text-white/50 hover:text-white transition-colors">{item}</a>
            </li>
          ))}
        </ul>
        {username ? (
          <div className="flex items-center gap-3">
            <a href="/profile" className="text-[13px] text-white/60 hover:text-white transition-colors">
              hey, {username}
            </a>
            <button
              onClick={() => {
                localStorage.removeItem("token")
                localStorage.removeItem("username")
                setUsername(null)
              }}
              className="text-[13px] font-medium px-[18px] py-2 border border-white/20 text-white/70 rounded-full hover:opacity-80 transition-all active:scale-95">
              Sign out
            </button>
          </div>
        ) : (
          <a href="/login" className="text-[13px] font-medium px-[18px] py-2 bg-white text-black rounded-full hover:opacity-80 transition-all active:scale-95">
            Sign in
          </a>
        )}
      </nav>
      <section className="text-center px-8 pt-[72px] pb-12">
        <div className="inline-flex items-center gap-2 text-[11px] text-white/60 border border-white/15 rounded-full px-3 py-[5px] mb-7 tracking-wide">
          <span className="w-[5px] h-[5px] bg-white rounded-full animate-pulse" />
          Now in beta
        </div>
        <h1 className="text-[52px] font-semibold tracking-[-2px] leading-[1.05] mb-4 bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">
          Code interviews,<br />multiplayer.
        </h1>
        <p className="text-[17px] text-white/45 leading-relaxed max-w-[420px] mx-auto mb-9">
          Real-time competitive coding rooms with live execution, test cases, and a 10-minute clock.
        </p>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full px-1.5 py-1.5 mb-1">
            {(["any", "easy", "medium", "hard"] as const).map(d => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={`text-[11px] px-3 py-[4px] rounded-full transition-all capitalize
                  ${difficulty === d
                    ? d === "easy" ? "bg-emerald-500 text-white font-semibold"
                    : d === "medium" ? "bg-amber-500 text-white font-semibold"
                    : d === "hard" ? "bg-red-500 text-white font-semibold"
                    : "bg-white text-black font-semibold"
                    : "text-white/40 hover:text-white/70"
                  }`}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={createRoom} disabled={creating}
              className="px-[26px] py-3 bg-white text-black text-[14px] font-medium rounded-full
                hover:opacity-85 transition-all hover:-translate-y-px active:scale-95
                disabled:opacity-50 disabled:cursor-not-allowed min-w-[148px]">
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />
                  Creating…
                </span>
              ) : "Create a room"}
            </button>
            <button onClick={quickMatch} disabled={matching}
              className="px-[26px] py-3 bg-white/10 border border-white/20 text-white text-[14px] font-medium rounded-full
                hover:opacity-85 transition-all hover:-translate-y-px active:scale-95
                disabled:opacity-50 min-w-[148px]">
              {matching ? "Finding match…" : "Quick Match ⚡"}
            </button>
            <button
              onClick={() => panel === "join" ? resetJoin() : setPanel("join")}
              className={`px-[26px] py-3 text-[14px] border rounded-full transition-all hover:-translate-y-px active:scale-95
                ${panel === "join"
                  ? "bg-white/10 border-white/40 text-white"
                  : "bg-transparent border-white/20 text-white/70 hover:border-white/50 hover:text-white"}`}>
              {panel === "join" ? "Cancel" : "Join with code →"}
            </button>
          </div>
          <div className={`overflow-hidden transition-all duration-300 ease-in-out w-full max-w-[360px]
            ${panel === "join" ? "max-h-[120px] opacity-100 mt-1" : "max-h-0 opacity-0"}`}>
            <div className={`flex gap-2 rounded-2xl border p-1.5 transition-colors
              ${isError ? "border-red-500/40 bg-red-500/[0.05]" : "border-white/15 bg-white/[0.04]"}`}>
              <input
                ref={inputRef}
                type="text"
                value={roomCode}
                onChange={e => handleCodeChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter room code…"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                className="flex-1 bg-transparent text-[14px] text-white placeholder-white/25
                  outline-none px-3 py-2 font-mono tracking-wide min-w-0"
              />
              <button onClick={joinRoom} disabled={joining || !roomCode.trim()}
                className="px-4 py-2 bg-white text-black text-[13px] font-medium rounded-xl
                  hover:opacity-85 transition-all active:scale-95
                  disabled:opacity-30 disabled:cursor-not-allowed shrink-0 min-w-[72px]">
                {joining && joinStatus === "checking" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-3 h-3 border border-black/30 border-t-black rounded-full animate-spin" />
                  </span>
                ) : "Join"}
              </button>
            </div>
            <div className={`text-[12px] mt-2 px-1 transition-all duration-200
              ${isError ? "text-red-400/80 opacity-100" : "opacity-0 h-0"}`}>
              {statusMsg[joinStatus] ?? ""}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-6 border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-[10px] bg-white/[0.04] border-b border-white/[0.08]">
          <span className="w-[10px] h-[10px] rounded-full bg-red-400/50" />
          <span className="w-[10px] h-[10px] rounded-full bg-yellow-400/50" />
          <span className="w-[10px] h-[10px] rounded-full bg-green-400/50" />
          <span className="ml-auto text-[11px] text-white/30 tracking-wide">room · xk29f</span>
        </div>
        <div className="grid grid-cols-2 min-h-[200px]">
          <div className="p-4 font-mono text-[12px] border-r border-white/[0.06]">
            {[
              <><span className="text-purple-300/90">def </span><span className="text-blue-300/90">two_sum</span><span className="text-white/70">(nums, target):</span></>,
              <><span className="text-white/70">  seen = {"{}"}</span></>,
              <><span className="text-purple-300/90">  for </span><span className="text-white/70">i, n </span><span className="text-purple-300/90">in </span><span className="text-blue-300/90">enumerate</span><span className="text-white/70">(nums):</span></>,
              <><span className="text-white/70">    diff = target - n</span></>,
              <><span className="text-purple-300/90">    if </span><span className="text-white/70">diff </span><span className="text-purple-300/90">in </span><span className="text-white/70">seen:</span></>,
              <><span className="text-purple-300/90">      return </span><span className="text-white/70">[seen[diff], i]<span className="inline-block w-[2px] h-[13px] bg-white align-middle animate-pulse" /></span></>,
              <><span className="text-white/70">    seen[n] = i</span></>,
            ].map((line, i) => (
              <div key={i} className="flex gap-3 mb-1">
                <span className="text-white/15 min-w-[16px] text-right">{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-[6px] text-[11px] px-[10px] py-1 rounded-full bg-white/[0.07] text-white/70">
                <span className="w-[6px] h-[6px] rounded-full bg-white" />
                you
              </span>
              <span className="inline-flex items-center gap-[6px] text-[11px] px-[10px] py-1 rounded-full bg-blue-300/10 text-blue-300/90">
                <span className="w-[6px] h-[6px] rounded-full bg-blue-300/90" />
                opponent
              </span>
            </div>
            <p className="text-[11px] text-white/30 mb-5">
              elapsed <span className="text-white/70 tabular-nums">04:17</span>
            </p>
            <p className="text-[10px] text-white/25 uppercase tracking-wide mb-2">output</p>
            <p className="font-mono text-[11px] text-green-300/80 mb-1">→ [0, 1]</p>
            <p className="font-mono text-[11px] text-green-300/80 mb-1">→ [1, 2]</p>
            <p className="font-mono text-[11px] text-white/25">3/4 tests passing…</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/[0.06] mx-6 mt-8 rounded-2xl overflow-hidden">
        {[
          { icon: "⚡", title: "Live sync", desc: "Cursors and keystrokes sync in real time via WebSockets." },
          { icon: "🐳", title: "Safe execution", desc: "Code runs in isolated Docker containers with resource limits." },
          { icon: "🏆", title: "Scored battles", desc: "Test accuracy + solve speed combined into a final score." },
        ].map(f => (
          <div key={f.title} className="bg-black p-6 hover:bg-white/[0.025] transition-colors">
            <div className="w-8 h-8 border border-white/12 rounded-lg flex items-center justify-center text-[15px] mb-3">
              {f.icon}
            </div>
            <h3 className="text-[13px] font-medium text-white mb-1">{f.title}</h3>
            <p className="text-[12px] text-white/35 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
      <div className="h-10" />
    </main>
  )
}