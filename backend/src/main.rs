use uuid::Uuid;
use axum::{
    extract::State,
    extract::Path,
    routing::{get, post},
    Router,
    Json,
};
use tokio::process::Command;
use std::time::Duration;
use axum::extract::ws::{WebSocket, WebSocketUpgrade, Message};
use tower_http::cors::{CorsLayer, Any};
use axum::http::Method;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::broadcast;
use futures::{sink::SinkExt, stream::StreamExt};
use sqlx::PgPool;
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};

#[derive(Clone, Serialize, Deserialize)]
struct TestCase {
    input: String,
    expected: String,
}

#[derive(Clone, Serialize)]
struct Question {
    id: u32,
    title: String,
    description: String,
    examples: Vec<Example>,
    constraints: Vec<String>,
    test_cases: Vec<TestCase>,
    starter_code: HashMap<String, String>,
    category: String,
    difficulty: String,
}

#[derive(Clone, Serialize)]
struct Example {
    input: String,
    output: String,
}

#[derive(Clone, PartialEq, Debug)]
enum GamePhase {
    Waiting,
    InProgress,
    GameOver,
}

#[derive(Clone)]
struct PlayerState {
    player_number: u8,
    tests_passed: u32,
    tests_total: u32,
    solve_time_secs: Option<u64>,
    submitted: bool,
}

#[derive(Clone)]
struct RoomState {
    phase: GamePhase,
    question_id: u32,
    players: HashMap<Uuid, PlayerState>,
    difficulty: String,
    started_at: Option<std::time::Instant>,
    tx: broadcast::Sender<String>,
}

type Rooms = Arc<RwLock<HashMap<Uuid, RoomState>>>;

#[derive(Clone)]
struct AppState {
    rooms: Rooms,
    questions: Arc<Vec<Question>>,
    queue: Arc<tokio::sync::Mutex<Vec<tokio::sync::oneshot::Sender<String>>>>,
    db: PgPool,
}

#[derive(Serialize)]
struct StatusResponse { status: String }

#[derive(Serialize, Deserialize)]
struct CreateRoomRequest { room_name: String, difficulty: String }

#[derive(Serialize)]
struct CreateRoomResponse { room_id: String, room_name: String }

#[derive(Deserialize)]
struct ExecuteRequest { code: String, language: String }

#[derive(Serialize)]
struct ExecuteResponse { stdout: String, stderr: String, success: bool }

#[derive(Deserialize)]
struct SubmitRequest {
    room_id: String,
    player_id: String,
    code: String,
    language: String,
}

#[derive(Serialize)]
struct SubmitResponse {
    tests_passed: u32,
    tests_total: u32,
    score: f64,
}

#[derive(Deserialize)]
struct ResignRequest {
    room_id: String,
    player_id: String,
}

#[derive(Serialize, Deserialize)]
struct AuthRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    username: String,
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    username: String,
    exp: usize,
}

#[derive(Serialize)]
struct UserStats {
    username: String,
    games_played: i64,
    wins: i64,
}

fn build_question_bank() -> Vec<Question> {
    vec![
        Question {
            id: 1,
            title: "Two Sum".into(),
            description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.".into(),
            examples: vec![
                Example { input: "nums = [2,7,11,15], target = 9".into(), output: "[0,1]".into() },
                Example { input: "nums = [3,2,4], target = 6".into(), output: "[1,2]".into() },
            ],
            constraints: vec!["2 <= nums.length <= 10^4".into(), "-10^9 <= nums[i] <= 10^9".into()],
            test_cases: vec![
                TestCase { input: "[2,7,11,15]\n9".into(), expected: "[0, 1]".into() },
                TestCase { input: "[3,2,4]\n6".into(), expected: "[1, 2]".into() },
                TestCase { input: "[3,3]\n6".into(), expected: "[0, 1]".into() },
                TestCase { input: "[1,2,3,4]\n7".into(), expected: "[2, 3]".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def two_sum(nums, target):\n    pass\n".into()),
                ("javascript".into(), "function twoSum(nums, target) {\n  \n}\n".into()),
            ]),
            category: "Arrays".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 2,
            title: "Valid Parentheses".into(),
            description: "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.".into(),
            examples: vec![
                Example { input: "s = \"()\"".into(), output: "true".into() },
                Example { input: "s = \"()[{}]\"".into(), output: "true".into() },
                Example { input: "s = \"(]\"".into(), output: "false".into() },
            ],
            constraints: vec!["1 <= s.length <= 10^4".into()],
            test_cases: vec![
                TestCase { input: "()".into(), expected: "true".into() },
                TestCase { input: "()[{}]".into(), expected: "true".into() },
                TestCase { input: "(]".into(), expected: "false".into() },
                TestCase { input: "{[]}".into(), expected: "true".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def is_valid(s):\n    pass\n".into()),
                ("javascript".into(), "function isValid(s) {\n  \n}\n".into()),
            ]),
            category: "Stack".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 3,
            title: "Best Time to Buy and Sell Stock".into(),
            description: "Given an array prices where prices[i] is the price of a stock on day i, return the maximum profit you can achieve. If no profit is possible, return 0.".into(),
            examples: vec![
                Example { input: "[7,1,5,3,6,4]".into(), output: "5".into() },
                Example { input: "[7,6,4,3,1]".into(), output: "0".into() },
            ],
            constraints: vec!["1 <= prices.length <= 10^5".into(), "0 <= prices[i] <= 10^4".into()],
            test_cases: vec![
                TestCase { input: "[7,1,5,3,6,4]".into(), expected: "5".into() },
                TestCase { input: "[7,6,4,3,1]".into(), expected: "0".into() },
                TestCase { input: "[1,2]".into(), expected: "1".into() },
                TestCase { input: "[2,4,1]".into(), expected: "2".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def max_profit(prices):\n    pass\n".into()),
                ("javascript".into(), "function maxProfit(prices) {\n  \n}\n".into()),
            ]),
            category: "Arrays".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 4,
            title: "Binary Search".into(),
            description: "Given a sorted array of integers nums and an integer target, return the index of target, or -1 if not found.".into(),
            examples: vec![
                Example { input: "nums = [1,3,5,7,9], target = 5".into(), output: "2".into() },
                Example { input: "nums = [1,3,5,7,9], target = 4".into(), output: "-1".into() },
            ],
            constraints: vec!["1 <= nums.length <= 10^4".into(), "nums is sorted ascending".into()],
            test_cases: vec![
                TestCase { input: "[1,3,5,7,9]\n5".into(), expected: "2".into() },
                TestCase { input: "[1,3,5,7,9]\n4".into(), expected: "-1".into() },
                TestCase { input: "[1]\n1".into(), expected: "0".into() },
                TestCase { input: "[1,2,3,4,5]\n1".into(), expected: "0".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def search(nums, target):\n    pass\n".into()),
                ("javascript".into(), "function search(nums, target) {\n  \n}\n".into()),
            ]),
            category: "Search".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 5,
            title: "Climbing Stairs".into(),
            description: "You are climbing a staircase with n steps. Each time you can climb 1 or 2 steps. In how many distinct ways can you climb to the top?".into(),
            examples: vec![
                Example { input: "n = 3".into(), output: "3".into() },
                Example { input: "n = 5".into(), output: "8".into() },
            ],
            constraints: vec!["1 <= n <= 45".into()],
            test_cases: vec![
                TestCase { input: "3".into(), expected: "3".into() },
                TestCase { input: "5".into(), expected: "8".into() },
                TestCase { input: "1".into(), expected: "1".into() },
                TestCase { input: "10".into(), expected: "89".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def climb_stairs(n):\n    pass\n".into()),
                ("javascript".into(), "function climbStairs(n) {\n  \n}\n".into()),
            ]),
            category: "DP".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 6,
            title: "Valid Anagram".into(),
            description: "Given two strings s and t, return true if t is an anagram of s, and false otherwise.".into(),
            examples: vec![
                Example { input: "s = \"anagram\", t = \"nagaram\"".into(), output: "true".into() },
                Example { input: "s = \"rat\", t = \"car\"".into(), output: "false".into() },
            ],
            constraints: vec!["1 <= s.length, t.length <= 5 * 10^4".into()],
            test_cases: vec![
                TestCase { input: "anagram\nnagaram".into(), expected: "true".into() },
                TestCase { input: "rat\ncar".into(), expected: "false".into() },
                TestCase { input: "a\na".into(), expected: "true".into() },
                TestCase { input: "ab\nba".into(), expected: "true".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def is_anagram(s, t):\n    pass\n".into()),
                ("javascript".into(), "function isAnagram(s, t) {\n  \n}\n".into()),
            ]),
            category: "Strings".into(),
            difficulty: "easy".into(),
        },
        Question {
            id: 7,
            title: "Maximum Subarray".into(),
            description: "Given an integer array nums, find the contiguous subarray with the largest sum and return its sum.".into(),
            examples: vec![
                Example { input: "[-2,1,-3,4,-1,2,1,-5,4]".into(), output: "6".into() },
                Example { input: "[1]".into(), output: "1".into() },
            ],
            constraints: vec!["1 <= nums.length <= 10^5".into(), "-10^4 <= nums[i] <= 10^4".into()],
            test_cases: vec![
                TestCase { input: "[-2,1,-3,4,-1,2,1,-5,4]".into(), expected: "6".into() },
                TestCase { input: "[1]".into(), expected: "1".into() },
                TestCase { input: "[-1]".into(), expected: "-1".into() },
                TestCase { input: "[5,4,-1,7,8]".into(), expected: "23".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def max_subarray(nums):\n    pass\n".into()),
                ("javascript".into(), "function maxSubarray(nums) {\n  \n}\n".into()),
            ]),
            category: "DP".into(),
            difficulty: "medium".into(),
        },
        Question {
            id: 8,
            title: "Container With Most Water".into(),
            description: "Given n non-negative integers representing heights of lines, find two lines that together with the x-axis form a container that holds the most water.".into(),
            examples: vec![
                Example { input: "[1,8,6,2,5,4,8,3,7]".into(), output: "49".into() },
                Example { input: "[1,1]".into(), output: "1".into() },
            ],
            constraints: vec!["2 <= height.length <= 10^5".into(), "0 <= height[i] <= 10^4".into()],
            test_cases: vec![
                TestCase { input: "[1,8,6,2,5,4,8,3,7]".into(), expected: "49".into() },
                TestCase { input: "[1,1]".into(), expected: "1".into() },
                TestCase { input: "[4,3,2,1,4]".into(), expected: "16".into() },
                TestCase { input: "[1,2,1]".into(), expected: "2".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def max_area(height):\n    pass\n".into()),
                ("javascript".into(), "function maxArea(height) {\n  \n}\n".into()),
            ]),
            category: "Two Pointers".into(),
            difficulty: "medium".into(),
        },
        Question {
            id: 9,
            title: "Product of Array Except Self".into(),
            description: "Given an integer array nums, return an array answer such that answer[i] is equal to the product of all elements except nums[i]. Must run in O(n) without division.".into(),
            examples: vec![
                Example { input: "[1,2,3,4]".into(), output: "[24,12,8,6]".into() },
                Example { input: "[-1,1,0,-3,3]".into(), output: "[0,0,9,0,0]".into() },
            ],
            constraints: vec!["2 <= nums.length <= 10^5".into(), "The product fits in a 32-bit integer".into()],
            test_cases: vec![
                TestCase { input: "[1,2,3,4]".into(), expected: "[24, 12, 8, 6]".into() },
                TestCase { input: "[2,3]".into(), expected: "[3, 2]".into() },
                TestCase { input: "[1,1,1]".into(), expected: "[1, 1, 1]".into() },
                TestCase { input: "[2,2,2,2]".into(), expected: "[8, 8, 8, 8]".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def product_except_self(nums):\n    pass\n".into()),
                ("javascript".into(), "function productExceptSelf(nums) {\n  \n}\n".into()),
            ]),
            category: "Arrays".into(),
            difficulty: "medium".into(),
        },
        Question {
            id: 10,
            title: "3Sum".into(),
            description: "Given an integer array nums, return all triplets [nums[i], nums[j], nums[k]] such that i != j != k and nums[i] + nums[j] + nums[k] == 0. The solution must not contain duplicate triplets.".into(),
            examples: vec![
                Example { input: "[-1,0,1,2,-1,-4]".into(), output: "[[-1,-1,2],[-1,0,1]]".into() },
                Example { input: "[0,0,0]".into(), output: "[[0,0,0]]".into() },
            ],
            constraints: vec!["3 <= nums.length <= 3000".into(), "-10^5 <= nums[i] <= 10^5".into()],
            test_cases: vec![
                TestCase { input: "[-1,0,1,2,-1,-4]".into(), expected: "[[-1, -1, 2], [-1, 0, 1]]".into() },
                TestCase { input: "[0,0,0]".into(), expected: "[[0, 0, 0]]".into() },
                TestCase { input: "[0,1,1]".into(), expected: "[]".into() },
                TestCase { input: "[-2,0,1,1,2]".into(), expected: "[[-2, 0, 2], [-2, 1, 1]]".into() },
            ],
            starter_code: HashMap::from([
                ("python".into(), "def three_sum(nums):\n    pass\n".into()),
                ("javascript".into(), "function threeSum(nums) {\n  \n}\n".into()),
            ]),
            category: "Two Pointers".into(),
            difficulty: "medium".into(),
        },
    ]
}

const GAME_DURATION_SECS: u64 = 600;

fn compute_score(tests_passed: u32, tests_total: u32, solve_time_secs: u64) -> f64 {
    if tests_total == 0 { return 0.0; }
    let accuracy = tests_passed as f64 / tests_total as f64;
    let time_ratio = 1.0 - (solve_time_secs as f64 / GAME_DURATION_SECS as f64);
    (accuracy * 100.0) + time_ratio.max(0.0) * 20.0
}

#[tokio::main]
async fn main() {
    
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or("postgresql://localhost/arena".into());
    let db = sqlx::postgres::PgPoolOptions::new()
    .max_connections(5)
    .acquire_timeout(Duration::from_secs(30))
    .connect(&db_url)
    .await
    .expect(&format!("Failed to connect to database: {}", db_url));
    let state = AppState {
        rooms: Arc::new(RwLock::new(HashMap::new())),
        questions: Arc::new(build_question_bank()),
        queue: Arc::new(tokio::sync::Mutex::new(Vec::new())),
        db,
    };

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/room", post(create_room))
        .route("/room/:id", get(get_room))
        .route("/ws/:room_id", get(ws_handler))
        .route("/execute", post(execute_code))
        .route("/submit", post(submit_code))
        .route("/queue", post(join_queue))
        .route("/resign", post(resign))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/me/stats", get(get_stats))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST])
                .allow_headers(Any),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Server running on port 8080");
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> Json<StatusResponse> { Json(StatusResponse { status: "ok".into() }) }
async fn health() -> Json<StatusResponse> { Json(StatusResponse { status: "healthy".into() }) }

async fn get_room(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
) -> Json<serde_json::Value> {
    let id = match Uuid::parse_str(&room_id) {
        Ok(v) => v,
        Err(_) => return Json(serde_json::json!({ "error": "invalid room id" })),
    };
    let rooms = state.rooms.read().await;
    match rooms.get(&id) {
        Some(r) => Json(serde_json::json!({
            "room_id": id.to_string(),
            "phase": format!("{:?}", r.phase),
            "players": r.players.len(),
        })),
        None => Json(serde_json::json!({ "error": "room not found" })),
    }
}

async fn create_room(
    State(state): State<AppState>,
    Json(payload): Json<CreateRoomRequest>,
) -> Json<CreateRoomResponse> {
    let room_id = Uuid::new_v4();
    let (tx, _) = broadcast::channel(64);
    let room = RoomState {
        phase: GamePhase::Waiting,
        question_id: 0,
        difficulty: payload.difficulty.clone(),
        players: HashMap::new(),
        started_at: None,
        tx,
    };
    state.rooms.write().await.insert(room_id, room);
    Json(CreateRoomResponse { room_id: room_id.to_string(), room_name: payload.room_name })
}

async fn submit_code(
    State(state): State<AppState>,
    Json(payload): Json<SubmitRequest>,
) -> Json<SubmitResponse> {
    let room_id = Uuid::parse_str(&payload.room_id).unwrap_or_default();
    let player_id = Uuid::parse_str(&payload.player_id).unwrap_or_default();

    let (question, elapsed, tx) = {
        let rooms = state.rooms.read().await;
        let room = match rooms.get(&room_id) {
            Some(r) => r,
            None => return Json(SubmitResponse { tests_passed: 0, tests_total: 0, score: 0.0 }),
        };
        let q = state.questions.iter().find(|q| q.id == room.question_id).cloned();
        let elapsed = room.started_at
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(GAME_DURATION_SECS);
        (q, elapsed, room.tx.clone())
    };

    let question = match question {
        Some(q) => q,
        None => return Json(SubmitResponse { tests_passed: 0, tests_total: 0, score: 0.0 }),
    };

    let tests_total = question.test_cases.len() as u32;
    let mut tests_passed = 0u32;

    for test in &question.test_cases {
        let wrapped = wrap_code_with_test(&payload.language, &payload.code, &question, test);
        let output = run_in_docker(&wrapped, &payload.language).await;
        if output.stdout.trim() == test.expected.trim() {
            tests_passed += 1;
        }
    }

    let score = compute_score(tests_passed, tests_total, elapsed);

    {
        let mut rooms = state.rooms.write().await;
        if let Some(room) = rooms.get_mut(&room_id) {
            if let Some(player) = room.players.get_mut(&player_id) {
                player.tests_passed = tests_passed;
                player.tests_total = tests_total;
                player.solve_time_secs = Some(elapsed);
                player.submitted = true;
            }

            let player_num = room.players.get(&player_id).map(|p| p.player_number).unwrap_or(0);
            let _ = tx.send(serde_json::json!({
                "type": "score_update",
                "player": player_num,
                "tests_passed": tests_passed,
                "tests_total": tests_total,
                "score": score,
            }).to_string());

            let all_submitted = room.players.len() == 2
                && room.players.values().all(|p| p.submitted);
            if all_submitted && room.phase == GamePhase::InProgress {
                room.phase = GamePhase::GameOver;
                broadcast_game_over(&room.players, room.question_id, &tx);

                let players: Vec<_> = room.players.values().cloned().collect();
                let q_id = room.question_id as i32;
                let db = state.db.clone();
                tokio::spawn(async move {
                    if players.len() == 2 {
                        let p1 = &players[0];
                        let p2 = &players[1];
                        let p1_score = compute_score(p1.tests_passed, p1.tests_total, p1.solve_time_secs.unwrap_or(GAME_DURATION_SECS));
                        let p2_score = compute_score(p2.tests_passed, p2.tests_total, p2.solve_time_secs.unwrap_or(GAME_DURATION_SECS));
                        let _ = sqlx::query!(
                            "INSERT INTO matches (question_id, player1_score, player2_score) VALUES ($1, $2, $3)",
                            q_id,
                            p1_score,
                            p2_score,
                        )
                        .execute(&db)
                        .await;
                    }
                });
            }
        }
    }

    Json(SubmitResponse { tests_passed, tests_total, score })
}

async fn ws_handler(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl axum::response::IntoResponse {
    let room_id = Uuid::parse_str(&room_id).unwrap_or_default();
    ws.on_upgrade(move |socket| handle_socket(socket, state, room_id))
}

async fn handle_socket(socket: WebSocket, state: AppState, room_id: Uuid) {
    let player_id = Uuid::new_v4();

    let (tx, player_number, should_start) = {
        let mut rooms = state.rooms.write().await;
        let room = match rooms.get_mut(&room_id) {
            Some(r) => r,
            None => return,
        };

        if room.players.len() >= 2 || room.phase == GamePhase::GameOver {
            return;
        }

        let player_number = if room.players.is_empty() { 1u8 } else { 2u8 };
        room.players.insert(player_id, PlayerState {
            player_number,
            tests_passed: 0,
            tests_total: 0,
            solve_time_secs: None,
            submitted: false,
        });

        let should_start = room.players.len() == 2 && room.phase == GamePhase::Waiting;
        (room.tx.clone(), player_number, should_start)
    };

    let (mut sender, mut receiver) = socket.split();

    let player_count = {
        state.rooms.read().await
            .get(&room_id)
            .map(|r| r.players.len())
            .unwrap_or(1)
    };

    let _ = sender.send(Message::Text(serde_json::json!({
        "type": "identity",
        "player_number": player_number,
        "player_id": player_id.to_string(),
        "player_count": player_count,
    }).to_string().into())).await;

    let _ = tx.send(serde_json::json!({
        "type": "player_joined",
        "player_count": player_count,
    }).to_string());

    if should_start {
        let difficulty = {
            state.rooms.read().await
                .get(&room_id)
                .map(|r| r.difficulty.clone())
                .unwrap_or("any".into())
        };
        let question_id = pick_random_question(&state.questions, &difficulty);
        let question = state.questions.iter()
            .find(|q| q.id == question_id)
            .unwrap()
            .clone();

        {
            let mut rooms = state.rooms.write().await;
            if let Some(room) = rooms.get_mut(&room_id) {
                room.question_id = question_id;
                room.phase = GamePhase::InProgress;
                room.started_at = Some(std::time::Instant::now());
            }
        }

        tokio::time::sleep(Duration::from_millis(300)).await;

        let _ = tx.send(serde_json::json!({
            "type": "game_start",
            "question": question,
            "duration_secs": GAME_DURATION_SECS,
        }).to_string());

        spawn_game_timer(state.clone(), room_id, tx.clone());
    }

    let mut rx = tx.subscribe();
    {
        let rooms = state.rooms.read().await;
        if let Some(room) = rooms.get(&room_id) {
            if room.phase == GamePhase::InProgress {
                let q = state.questions.iter().find(|q| q.id == room.question_id).cloned();
                if let Some(q) = q {
                    let msg = serde_json::json!({
                        "type": "game_start",
                        "question": q,
                        "duration_secs": GAME_DURATION_SECS,
                    }).to_string();
                    let _ = sender.send(Message::Text(msg.into())).await;
                }
            }
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let state2 = state.clone();
    let tx2 = tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            let msg: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match msg["type"].as_str() {
                Some("rematch_request") => {
                    let _ = tx2.send(serde_json::json!({
                        "type": "rematch_requested",
                        "from_player": msg["player_number"],
                    }).to_string());
                }
                Some("rematch_accept") => {
                    let new_room_id = uuid::Uuid::new_v4();
                    let (new_tx, _) = tokio::sync::broadcast::channel(64);
                    let difficulty = {
                        state2.rooms.read().await
                            .get(&room_id)
                            .map(|r| r.difficulty.clone())
                            .unwrap_or("any".into())
                    };
                    let new_room = RoomState {
                        phase: GamePhase::Waiting,
                        question_id: 0,
                        difficulty,
                        players: HashMap::new(),
                        started_at: None,
                        tx: new_tx,
                    };
                    state2.rooms.write().await.insert(new_room_id, new_room);
                    let _ = tx2.send(serde_json::json!({
                        "type": "rematch_starting",
                        "room_id": new_room_id.to_string(),
                    }).to_string());
                }
                _ => {}
            }
        }

        let mut rooms = state2.rooms.write().await;
        if let Some(room) = rooms.get_mut(&room_id) {
            room.players.remove(&player_id);
            let count = room.players.len();
            let _ = tx2.send(serde_json::json!({
                "type": "player_left",
                "player_count": count,
            }).to_string());
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

fn spawn_game_timer(state: AppState, room_id: Uuid, tx: broadcast::Sender<String>) {
    tokio::spawn(async move {
        {
            let mut rooms = state.rooms.write().await;
            if let Some(room) = rooms.get_mut(&room_id) {
                room.phase = GamePhase::InProgress;
                room.started_at = Some(std::time::Instant::now());
            }
        }

        for remaining in (0u64..=GAME_DURATION_SECS).rev() {
            tokio::time::sleep(Duration::from_secs(1)).await;

            {
                let rooms = state.rooms.read().await;
                if let Some(room) = rooms.get(&room_id) {
                    if room.phase == GamePhase::GameOver { return; }
                }
            }

            let _ = tx.send(serde_json::json!({
                "type": "tick",
                "remaining": remaining,
            }).to_string());

            if remaining == 0 {
                let mut rooms = state.rooms.write().await;
                if let Some(room) = rooms.get_mut(&room_id) {
                    if room.phase == GamePhase::InProgress {
                        room.phase = GamePhase::GameOver;
                        broadcast_game_over(&room.players, room.question_id, &tx);
                    }
                }
                return;
            }
        }
    });
}

fn pick_random_question(questions: &[Question], difficulty: &str) -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let filtered: Vec<&Question> = questions.iter()
        .filter(|q| difficulty == "any" || q.difficulty == difficulty)
        .collect();
    let pool = if filtered.is_empty() { questions.iter().collect::<Vec<_>>() } else { filtered };
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as usize;
    pool[seed % pool.len()].id
}

fn broadcast_game_over(
    players: &HashMap<Uuid, PlayerState>,
    question_id: u32,
    tx: &broadcast::Sender<String>,
) {
    let mut results: Vec<serde_json::Value> = players.values().map(|p| {
        let elapsed = p.solve_time_secs.unwrap_or(GAME_DURATION_SECS);
        let score = compute_score(p.tests_passed, p.tests_total, elapsed);
        serde_json::json!({
            "player": p.player_number,
            "tests_passed": p.tests_passed,
            "tests_total": p.tests_total,
            "solve_time_secs": elapsed,
            "score": score,
        })
    }).collect();

    results.sort_by(|a, b| {
        b["score"].as_f64().unwrap_or(0.0)
            .partial_cmp(&a["score"].as_f64().unwrap_or(0.0))
            .unwrap()
    });

    let winner = results.first()
        .and_then(|r| r["player"].as_u64())
        .unwrap_or(0);

    let _ = tx.send(serde_json::json!({
        "type": "game_over",
        "winner_player": winner,
        "results": results,
        "question_id": question_id,
    }).to_string());
}

fn wrap_code_with_test(lang: &str, code: &str, question: &Question, test: &TestCase) -> String {
    match lang {
        "python" => format!(
            "{code}\n\nlines = '''{input}'''.strip().split('\\n')\n{call}\nprint(result)",
            code = code,
            input = test.input,
            call = match question.id {
                1 => "import json\nnums = json.loads(lines[0])\ntarget = int(lines[1])\nresult = two_sum(nums, target)",
                2 => "result = str(is_valid(lines[0])).lower()",
                3 => "import json\nresult = max_profit(json.loads(lines[0]))",
                4 => "import json\nnums = json.loads(lines[0])\ntarget = int(lines[1])\nresult = search(nums, target)",
                5 => "result = climb_stairs(int(lines[0]))",
                6 => "result = str(is_anagram(lines[0], lines[1])).lower()",
                7 => "import json\nresult = max_subarray(json.loads(lines[0]))",
                8 => "import json\nresult = max_area(json.loads(lines[0]))",
                9 => "import json\nresult = product_except_self(json.loads(lines[0]))",
                10 => "import json\nresult = three_sum(json.loads(lines[0]))",
                _ => "result = None",
            },
        ),
        "javascript" => format!(
            "{code}\n\nconst lines = `{input}`.trim().split('\\n');\n{call}\nconsole.log(JSON.stringify(result));",
            code = code,
            input = test.input,
            call = match question.id {
                1 => "const nums = JSON.parse(lines[0]); const target = parseInt(lines[1]); const result = twoSum(nums, target);",
                2 => "const result = isValid(lines[0]);",
                3 => "const result = maxProfit(JSON.parse(lines[0]));",
                4 => "const nums = JSON.parse(lines[0]); const target = parseInt(lines[1]); const result = search(nums, target);",
                5 => "const result = climbStairs(parseInt(lines[0]));",
                6 => "const result = isAnagram(lines[0], lines[1]);",
                7 => "const result = maxSubarray(JSON.parse(lines[0]));",
                8 => "const result = maxArea(JSON.parse(lines[0]));",
                9 => "const result = productExceptSelf(JSON.parse(lines[0]));",
                10 => "const result = threeSum(JSON.parse(lines[0]));",
                _ => "const result = null;",
            },
        ),
        _ => code.to_string(),
    }
}

struct RunResult { stdout: String, stderr: String }

async fn run_in_docker(code: &str, language: &str) -> RunResult {
    let (image, filename, run_cmd) = match language {
        "python"     => ("python:3.11-slim", "main.py",   vec!["python", "/code/main.py"]),
        "javascript" => ("node:20-slim",     "main.js",   vec!["node", "/code/main.js"]),
        "typescript" => ("node:20-slim",     "main.ts",   vec!["npx", "ts-node", "/code/main.ts"]),
        "rust"       => ("rust:slim",        "main.rs",   vec!["bash", "-c", "rustc /code/main.rs -o /tmp/out && /tmp/out"]),
        "cpp"        => ("gcc:latest",       "main.cpp",  vec!["bash", "-c", "g++ /code/main.cpp -o /tmp/out && /tmp/out"]),
        "java"       => ("openjdk:21-slim",  "Main.java", vec!["bash", "-c", "javac /code/Main.java -d /tmp && java -cp /tmp Main"]),
        "go"         => ("golang:slim",      "main.go",   vec!["go", "run", "/code/main.go"]),
        _            => ("python:3.11-slim", "main.py",   vec!["python", "/code/main.py"]),
    };

    let tmp_dir = format!("/tmp/arena_{}", Uuid::new_v4());
    if std::fs::create_dir_all(&tmp_dir).is_err() {
        return RunResult { stdout: "".into(), stderr: "fs error".into() };
    }
    let _ = std::fs::write(format!("{}/{}", tmp_dir, filename), code);

    let args: Vec<String> = vec![
        "run".into(), "--rm".into(),
        "--memory=128m".into(), "--cpus=0.5".into(), "--network=none".into(),
        "-v".into(), format!("{}:/code", tmp_dir),
        image.into(),
    ]
    .into_iter()
    .chain(run_cmd.iter().map(|s| s.to_string()))
    .collect();

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        Command::new("docker").args(&args).output(),
    ).await;

    let _ = std::fs::remove_dir_all(&tmp_dir);

    match result {
        Ok(Ok(out)) => RunResult {
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        },
        _ => RunResult { stdout: "".into(), stderr: "timeout or exec error".into() },
    }
}

async fn execute_code(Json(payload): Json<ExecuteRequest>) -> Json<ExecuteResponse> {
    let result = run_in_docker(&payload.code, &payload.language).await;
    Json(ExecuteResponse {
        stdout: result.stdout.clone(),
        stderr: result.stderr.clone(),
        success: !result.stdout.is_empty(),
    })
}

async fn register(
    State(state): State<AppState>,
    Json(payload): Json<AuthRequest>,
) -> Json<serde_json::Value> {
    if payload.username.len() < 3 || payload.password.len() < 6 {
        return Json(serde_json::json!({ "error": "username min 3 chars, password min 6 chars" }));
    }

    let password_hash = match hash(&payload.password, DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => return Json(serde_json::json!({ "error": "server error" })),
    };

    let result = sqlx::query!(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
        payload.username,
        password_hash,
    )
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(row) => {
            let token = make_token(row.id.to_string(), &row.username);
            Json(serde_json::json!({ "token": token, "username": row.username }))
        }
        Err(_) => Json(serde_json::json!({ "error": "username already taken" })),
    }
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<AuthRequest>,
) -> Json<serde_json::Value> {
    let result = sqlx::query!(
        "SELECT id, username, password_hash FROM users WHERE username = $1",
        payload.username,
    )
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(row) => {
            if verify(&payload.password, &row.password_hash).unwrap_or(false) {
                let token = make_token(row.id.to_string(), &row.username);
                Json(serde_json::json!({ "token": token, "username": row.username }))
            } else {
                Json(serde_json::json!({ "error": "invalid password" }))
            }
        }
        Err(_) => Json(serde_json::json!({ "error": "user not found" })),
    }
}

fn make_token(user_id: String, username: &str) -> String {
    let secret = std::env::var("JWT_SECRET").unwrap_or("supersecretkey123".into());
    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        exp: (chrono::Utc::now() + chrono::Duration::days(30)).timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .unwrap_or_default()
}

async fn get_stats(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let token = match params.get("token") {
        Some(t) => t.clone(),
        None => return Json(serde_json::json!({ "error": "no token" })),
    };

    let secret = std::env::var("JWT_SECRET").unwrap_or("supersecretkey123".into());
    let claims = match decode::<Claims>(
        &token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(c) => c.claims,
        Err(_) => return Json(serde_json::json!({ "error": "invalid token" })),
    };

    let games_played = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM matches",
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);

    Json(serde_json::json!({
        "username": claims.username,
        "games_played": games_played,
        "wins": 0,
    }))
}

async fn join_queue(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let (my_tx, rx) = tokio::sync::oneshot::channel::<String>();

    let matched_room = {
        let mut queue = state.queue.lock().await;
        if queue.is_empty() {
            queue.push(my_tx);
            None
        } else {
            let partner = queue.remove(0);
            let room_id = Uuid::new_v4();
            let (broadcast_tx, _) = broadcast::channel(64);
            let room = RoomState {
                phase: GamePhase::Waiting,
                question_id: 0,
                difficulty: "any".into(),
                players: HashMap::new(),
                started_at: None,
                tx: broadcast_tx,
            };
            Some((partner, room_id, room))
        }
    };

    if let Some((partner, room_id, room)) = matched_room {
        state.rooms.write().await.insert(room_id, room);
        let room_id_str = room_id.to_string();
        let _ = partner.send(room_id_str.clone());
        return Json(serde_json::json!({ "room_id": room_id_str }));
    }

    match tokio::time::timeout(Duration::from_secs(30), rx).await {
        Ok(Ok(room_id)) => Json(serde_json::json!({ "room_id": room_id })),
        _ => Json(serde_json::json!({ "error": "no match found" })),
    }
}

async fn resign(
    State(state): State<AppState>,
    Json(payload): Json<ResignRequest>,
) -> Json<serde_json::Value> {
    let room_id = Uuid::parse_str(&payload.room_id).unwrap_or_default();
    let player_id = Uuid::parse_str(&payload.player_id).unwrap_or_default();

    let mut rooms = state.rooms.write().await;
    if let Some(room) = rooms.get_mut(&room_id) {
        if room.phase != GamePhase::InProgress {
            return Json(serde_json::json!({ "ok": false }));
        }

        let resigning_player = room.players.get(&player_id)
            .map(|p| p.player_number)
            .unwrap_or(0);

        let winner = room.players.values()
            .find(|p| p.player_number != resigning_player)
            .map(|p| p.player_number)
            .unwrap_or(0);

        room.phase = GamePhase::GameOver;

        let _ = room.tx.send(serde_json::json!({
            "type": "game_over",
            "winner_player": winner,
            "resigned_player": resigning_player,
            "results": room.players.values().map(|p| {
                serde_json::json!({
                    "player": p.player_number,
                    "tests_passed": p.tests_passed,
                    "tests_total": p.tests_total,
                    "solve_time_secs": p.solve_time_secs.unwrap_or(0),
                    "score": if p.player_number == winner { 100.0 } else { 0.0 },
                })
            }).collect::<Vec<_>>(),
        }).to_string());
    }

    Json(serde_json::json!({ "ok": true }))
}