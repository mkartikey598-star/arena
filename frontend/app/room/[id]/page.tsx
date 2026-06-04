"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Editor from "@monaco-editor/react"
import { useParams } from "next/navigation"

type Difficulty = "easy" | "medium" | "hard"

interface Example { input: string; output: string }

interface Question {
  id: number
  title: string
  description: string
  difficulty: Difficulty
  category: string
  examples: Example[]
  constraints: string[]
  starter_code: Record<string, string>
  test_cases: { input: string; expected: string }[]
}

interface PlayerResult {
  player: number
  tests_passed: number
  tests_total: number
  solve_time_secs: number
  score: number
}

interface ScoreEntry {
  player: number
  tests_passed: number
  tests_total: number
  score: number
}

const LANGUAGES = ["python", "javascript", "typescript", "cpp", "java", "rust", "go"]

const difficultyColors: Record<Difficulty, string> = {
  easy:   "text-emerald-400",
  medium: "text-amber-400",
  hard:   "text-red-400",
}

const difficultyBadge: Record<Difficulty, string> = {
  easy:   "bg-emerald-400/10 text-emerald-400 border-emerald-400/25",
  medium: "bg-amber-400/10   text-amber-400   border-amber-400/25",
  hard:   "bg-red-400/10     text-red-400     border-red-400/25",
}

export default function RoomPage() {
  const { id } = useParams()
  const wsRef = useRef<WebSocket | null>(null)

  const [playerNumber, setPlayerNumber] = useState<1 | 2 | null>(null)
  const playerIdRef = useRef<string>("")

  const [connected, setConnected] = useState(false)
  const [playerCount, setPlayerCount] = useState(1)
  const [phase, setPhase] = useState<"waiting" | "playing" | "over">("waiting")

  const [question, setQuestion] = useState<Question | null>(null)
  const [language, setLanguage] = useState("python")
  const [myCode, setMyCode] = useState("")

  const [remaining, setRemaining] = useState(600)

  const [output, setOutput] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [myScore, setMyScore] = useState<ScoreEntry | null>(null)
  const [opponentScore, setOpponentScore] = useState<ScoreEntry | null>(null)

  const [gameOver, setGameOver] = useState<{
    winner: number
    results: PlayerResult[]
  } | null>(null)
  const [rematchRequested, setRematchRequested] = useState(false)
  const [rematchBy, setRematchBy] = useState<number | null>(null)

  const [showProblem, setShowProblem] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!question) return
    const starter = question.starter_code[language] ?? `# No starter for ${language}\n`
    setMyCode(starter)
  }, [question, language])

  useEffect(() => {
    let ws: WebSocket | null = null
    let cancelled = false

    const connect = () => {
      ws = new WebSocket(`ws://localhost:8080/ws/${id}`)

      ws.onopen = () => {
        if (!cancelled) setConnected(true)
      }

      ws.onclose = () => {
        if (!cancelled) setConnected(false)
      }

      ws.onmessage = (event) => {
        if (cancelled) return
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case "identity":
            setPlayerNumber(msg.player_number as 1 | 2)
            playerIdRef.current = msg.player_id
            setPlayerCount(msg.player_count ?? 1)
            break
          case "player_joined":
            setPlayerCount(msg.player_count)
            break
          case "player_left":
            setPlayerCount(msg.player_count)
            break
          case "game_start":
            setQuestion(msg.question as Question)
            setRemaining(msg.duration_secs ?? 600)
            setPhase("playing")
            break
          case "tick":
            setRemaining(msg.remaining)
            break
          case "score_update":
            setPlayerNumber(prev => {
              if (msg.player !== prev) {
                setOpponentScore({
                  player: msg.player,
                  tests_passed: msg.tests_passed,
                  tests_total: msg.tests_total,
                  score: msg.score,
                })
              }
              return prev
            })
            break
          case "game_over":
            setPhase("over")
            setGameOver({ winner: msg.winner_player, results: msg.results })
            break
          case "rematch_requested":
            setRematchRequested(true)
            setRematchBy(msg.from_player)
            break
          case "rematch_starting":
            window.location.href = `/room/${msg.room_id}`
            break
        }
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      cancelled = true
      ws?.close()
      wsRef.current = null
    }
  }, [id])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0")
    const sec = (s % 60).toString().padStart(2, "0")
    return `${m}:${sec}`
  }

  const isUrgent = remaining <= 60 && phase === "playing"

  const runCode = useCallback(async () => {
    if (!myCode) return
    setRunning(true)
    setOutput(["running..."])
    try {
      const res = await fetch("http://localhost:8080/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: myCode, language }),
      })
      const data = await res.json()
      if (data.stdout) setOutput(data.stdout.split("\n").filter(Boolean))
      else if (data.stderr) setOutput([`Error: ${data.stderr}`])
      else setOutput(["(no output)"])
    } catch {
      setOutput(["Failed to reach backend"])
    }
    setRunning(false)
  }, [myCode, language])

  const submitCode = useCallback(async () => {
    if (!myCode || submitted || submitting) return
    setSubmitting(true)
    setOutput(["Judging against test cases..."])
    try {
      const res = await fetch("http://localhost:8080/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: id,
          player_id: playerIdRef.current,
          code: myCode,
          language,
        }),
      })
      const data = await res.json()
      setSubmitted(true)
      setMyScore({
        player: playerNumber ?? 0,
        tests_passed: data.tests_passed,
        tests_total: data.tests_total,
        score: data.score,
      })
      setOutput([
        `✓ ${data.tests_passed}/${data.tests_total} tests passed`,
        `Score: ${data.score.toFixed(1)}`,
      ])
    } catch {
      setOutput(["Submit failed — check backend connection"])
    }
    setSubmitting(false)
  }, [myCode, submitted, submitting, id, language, playerNumber])

  if (phase === "waiting") {
    return (
      <div className="bg-[#080808] h-screen text-white flex flex-col items-center justify-center gap-6">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 rounded-full bg-white/30 animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <p className="text-white/60 text-sm">
          {connected
            ? playerCount < 2
              ? "Waiting for opponent to join…"
              : "Both players connected — starting…"
            : "Connecting…"}
        </p>
        <div className="flex gap-2">
          {[1, 2].map(n => (
            <div key={n}
              className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs
                ${n <= playerCount
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 text-white/20"}`}>
              P{n}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/25 mt-2 font-mono">room {String(id).slice(0, 8)}</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/room/${id}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="text-[11px] px-3 py-1.5 border border-white/10 rounded-lg text-white/40
            hover:text-white/70 hover:border-white/25 transition-all active:scale-95">
          {copied ? "✓ copied" : "copy invite link"}
        </button>
      </div>
    )
  }

  const GameOverOverlay = () => {
    if (!gameOver || !playerNumber) return null
    const iWon = gameOver.winner === playerNumber
    const myResult = gameOver.results.find(r => r.player === playerNumber)
    const oppResult = gameOver.results.find(r => r.player !== playerNumber)

    const requestRematch = () => {
      wsRef.current?.send(JSON.stringify({
        type: "rematch_request",
        player_number: playerNumber,
      }))
    }

    const acceptRematch = () => {
      wsRef.current?.send(JSON.stringify({
        type: "rematch_accept",
        player_number: playerNumber,
      }))
    }

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8 w-[400px] text-center">
          <div className="text-4xl mb-3">{iWon ? "🏆" : "💀"}</div>
          <h2 className="text-xl font-semibold mb-1">{iWon ? "You won!" : "You lost"}</h2>
          <p className="text-white/40 text-sm mb-6">
            {iWon ? "Better solution, faster time." : "Better luck next time."}
          </p>
          <div className="space-y-3 text-left">
            {[myResult, oppResult].filter(Boolean).map(r => r && (
              <div key={r.player}
                className={`rounded-xl p-4 border ${r.player === playerNumber
                  ? "border-white/20 bg-white/[0.06]"
                  : "border-white/[0.08] bg-white/[0.02]"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">
                    {r.player === playerNumber ? "You" : "Opponent"}
                    {gameOver.winner === r.player && " 🏆"}
                  </span>
                  <span className="text-white/50 text-xs font-mono">{r.score.toFixed(1)} pts</span>
                </div>
                <div className="flex gap-4 text-xs text-white/40">
                  <span>{r.tests_passed}/{r.tests_total} tests</span>
                  <span>{Math.floor(r.solve_time_secs / 60)}m {r.solve_time_secs % 60}s</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            {rematchRequested && rematchBy !== playerNumber ? (
              <div className="mb-3 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5">
                <p className="text-amber-400 text-xs mb-2">Opponent wants a rematch</p>
                <button onClick={acceptRematch}
                  className="w-full py-2 bg-amber-400 text-black text-sm font-medium rounded-lg hover:opacity-85 transition-all">
                  Accept Rematch
                </button>
              </div>
            ) : rematchRequested && rematchBy === playerNumber ? (
              <p className="text-white/30 text-xs mb-3">Waiting for opponent to accept…</p>
            ) : null}
          </div>
          <div className="flex gap-2 mt-2">
            {!rematchRequested && (
              <button onClick={requestRematch}
                className="flex-1 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:opacity-85 transition-all">
                Rematch
              </button>
            )}
            <button onClick={() => window.location.href = "/"}
              className={`py-2.5 border border-white/15 text-white/70 text-sm font-medium rounded-xl hover:opacity-85 transition-all
                ${!rematchRequested ? "flex-1" : "w-full"}`}>
              Back to lobby
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#080808] h-screen text-white flex flex-col overflow-hidden">
      {phase === "over" && <GameOverOverlay />}
      <div className="flex items-center justify-between px-5 py-2 border-b border-white/[0.06] h-12 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
          <span className="text-[13px] font-semibold tracking-tight">Arena</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/25 uppercase tracking-widest">time</span>
            <span className={`text-[15px] font-mono font-semibold tabular-nums transition-colors
              ${isUrgent ? "text-red-400 animate-pulse" : "text-white/80"}`}>
              {formatTime(remaining)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2].map(n => (
              <span key={n}
                className={`w-[6px] h-[6px] rounded-full transition-colors
                  ${n <= playerCount ? "bg-emerald-400" : "bg-white/15"}`} />
            ))}
            <span className="text-[10px] text-white/25">{playerCount}/2</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-1 py-1">
            {LANGUAGES.map(lang => (
              <button key={lang} onClick={() => setLanguage(lang)}
                className={`text-[10px] px-2 py-[3px] rounded-md transition-all
                  ${language === lang ? "bg-white text-black font-semibold" : "text-white/35 hover:text-white/60"}`}>
                {lang}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-white/10" />
          <button onClick={runCode} disabled={running || phase !== "playing"}
            className="text-[12px] px-3 py-[5px] border border-white/15 text-white/70 font-medium
              rounded-lg hover:border-white/30 hover:text-white transition-all active:scale-95
              disabled:opacity-30 flex items-center gap-1.5">
            {running ? "running…" : <><span>Run</span><span className="text-[10px]">▶</span></>}
          </button>
          <button onClick={submitCode} disabled={submitting || submitted || phase !== "playing"}
            className={`text-[12px] px-4 py-[5px] font-medium rounded-lg transition-all active:scale-95
              flex items-center gap-1.5 disabled:opacity-40
              ${submitted
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                : "bg-white text-black hover:opacity-85"}`}>
            {submitted ? "✓ Submitted" : submitting ? "Judging…" : "Submit"}
          </button>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className={`w-[5px] h-[5px] rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-[10px] text-white/25">{connected ? "live" : "offline"}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {showProblem && question && (
          <div className="w-[310px] shrink-0 border-r border-white/[0.06] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-start gap-2 mb-1">
                <h2 className="text-[13px] font-semibold leading-snug flex-1">{question.title}</h2>
                <span className={`text-[9px] px-2 py-[2px] rounded-full border capitalize shrink-0 mt-0.5
                  ${difficultyBadge[question.difficulty as Difficulty] ?? ""}`}>
                  {question.difficulty}
                </span>
              </div>
              <span className="text-[10px] text-white/25 uppercase tracking-wide">{question.category}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-[12px] text-white/60 leading-relaxed">{question.description}</p>
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-wide mb-2">Examples</p>
                <div className="space-y-2">
                  {question.examples.map((ex, i) => (
                    <div key={i} className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                      <p className="font-mono text-[11px] text-white/45 mb-1">
                        Input: <span className="text-white/65">{ex.input}</span>
                      </p>
                      <p className="font-mono text-[11px] text-white/45">
                        Output: <span className="text-emerald-400/80">{ex.output}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-wide mb-2">Constraints</p>
                <ul className="space-y-1">
                  {question.constraints.map((c, i) => (
                    <li key={i} className="font-mono text-[11px] text-white/35">• {c}</li>
                  ))}
                </ul>
              </div>
            </div>
            {(myScore || opponentScore) && (
              <div className="border-t border-white/[0.06] p-3 space-y-2">
                <p className="text-[10px] text-white/25 uppercase tracking-wide mb-1">Scores</p>
                {myScore && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/50">You</span>
                    <span className="font-mono text-emerald-400">
                      {myScore.tests_passed}/{myScore.tests_total} · {myScore.score.toFixed(0)}pts
                    </span>
                  </div>
                )}
                {opponentScore && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/50">Opponent</span>
                    <span className="font-mono text-blue-400">
                      {opponentScore.tests_passed}/{opponentScore.tests_total} · {opponentScore.score.toFixed(0)}pts
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="border-t border-white/[0.06] p-3">
              <p className="text-[10px] text-white/25 uppercase tracking-wide mb-2">Console</p>
              <div className="font-mono text-[11px] bg-white/[0.02] rounded-lg p-3 border
                border-white/[0.06] min-h-[56px] max-h-[100px] overflow-y-auto">
                {output.length === 0
                  ? <span className="text-white/20">run your code to see output</span>
                  : output.map((line, i) => (
                    <p key={i} className={
                      line.startsWith("Error") || line.startsWith("Failed")
                        ? "text-red-400/80"
                        : line.startsWith("✓") || line.startsWith("Score")
                          ? "text-emerald-400/80"
                          : "text-white/60"
                    }>{line}</p>
                  ))}
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 shrink-0 h-9">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-white/45">you — player {playerNumber}</span>
            <button onClick={() => setShowProblem(s => !s)}
              className="ml-auto text-[11px] text-white/25 hover:text-white/50 transition-colors">
              {showProblem ? "hide problem" : "show problem"}
            </button>
          </div>
          <Editor
            height="100%"
            language={language === "cpp" ? "cpp" : language}
            theme="vs-dark"
            value={myCode}
            onChange={v => setMyCode(v ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              padding: { top: 14 },
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              renderLineHighlight: "gutter",
              overviewRulerBorder: false,
              glyphMargin: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              readOnly: submitted,
            }}
          />
        </div>
        <div className="w-px bg-white/[0.06] shrink-0" />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 shrink-0 h-9">
            <span className={`w-2 h-2 rounded-full ${playerCount >= 2 ? "bg-blue-400" : "bg-white/15"}`} />
            <span className="text-[11px] text-white/45">
              {playerCount >= 2
                ? `opponent — player ${playerNumber === 1 ? 2 : 1}`
                : "waiting for opponent…"}
            </span>
            {opponentScore && (
              <span className="ml-auto text-[10px] text-blue-400/70 font-mono">
                {opponentScore.tests_passed}/{opponentScore.tests_total} tests ·{" "}
                {opponentScore.score.toFixed(0)}pts
              </span>
            )}
          </div>
          <div className="relative flex-1">
            <Editor
              height="100%"
              language={language === "cpp" ? "cpp" : language}
              theme="vs-dark"
              value={
                playerCount < 2
                  ? "// waiting for opponent to join...\n"
                  : opponentScore
                    ? `// Opponent submitted: ${opponentScore.tests_passed}/${opponentScore.tests_total} tests passed\n`
                    : "// opponent is coding...\n"
              }
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 14 },
                fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                scrollBeyondLastLine: false,
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                glyphMargin: false,
                readOnly: true,
                smoothScrolling: true,
              }}
            />
            <div className="absolute inset-0 backdrop-blur-sm bg-[#080808]/40 pointer-events-none flex items-center justify-center">
              <div className="text-center">
                <p className="text-white/30 text-xs mb-1">
                  {opponentScore ? "Opponent finished" : "Opponent is coding…"}
                </p>
                {opponentScore && (
                  <p className="text-blue-400/60 text-xs font-mono">
                    {opponentScore.tests_passed}/{opponentScore.tests_total} tests passed
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}