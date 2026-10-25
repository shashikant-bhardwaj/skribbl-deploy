import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import useSocket from "./hooks/useSocket.js";
import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
import DrawingCanvas from "./components/DrawingCanvas.jsx";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_TIME_LEFT = 60;

const MESSAGES = {
  notConnected: "Not connected to the server.",
  notConnectedWait: "Not connected to the server. Please wait.",
  usernameRequired: "Please enter your username first.",
  requestFailed: "Request failed. Please try again.",
  startGameFailed: "Could not start the game.",
  rematchRequestFailed: "Play Again request failed.",
  rematchStartFailed: "Could not start the rematch.",
  leaveRoomFailed: "Could not leave the room.",
  copyFailed: "Could not copy the room code. Please copy it manually.",
  chooseWordFailed: "Could not select the word.",
  sendMessageFailed: "Message could not be sent.",
};

const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

const SETTINGS_OPTIONS = {
  maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
  rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
  wordChoiceCount: [1, 2, 3, 4, 5],
  hintCount: [0, 1, 2, 3, 4, 5],
};

const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// Room statuses that show the game play area instead of the lobby.
const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

/* Shared styles (light, chunky "game" look) */
const BTN_BASE =
  "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
const PANEL =
  "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
const INPUT =
  "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

/* -------------------------------------------------------------------------- */
/* Small presentational components                                            */
/* -------------------------------------------------------------------------- */

function Header({ socketConnected }) {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between">
      <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
        Skribbl<span className="text-pink-500">Play</span>
      </h1>

      <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            socketConnected ? "bg-green-500" : "bg-rose-500"
          }`}
        />
        {socketConnected ? "Connected" : "Connecting..."}
      </div>
    </header>
  );
}

function ErrorBanner({ error }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
    >
      {error}
    </div>
  );
}

function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {formatLabel(n)}
          </option>
        ))}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Home screen                                                                */
/* -------------------------------------------------------------------------- */

function HomeScreen({
  username,
  setUsername,
  roomCode,
  setRoomCode,
  loading,
  socketConnected,
  runRoomAction,
}) {
  const joinRoom = () =>
    runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

  return (
    <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
        Draw · Guess · Win
      </p>

      <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
        Ready to doodle? ✏️
      </h2>

      <p className="mt-3 leading-7 text-slate-500">
        Choose your name and play a drawing and guessing game with your friends.
      </p>

      <label
        htmlFor="username"
        className="mt-8 block text-sm font-semibold text-slate-700"
      >
        Your username
      </label>

      <input
        id="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            runRoomAction("matchmaking:join");
          }
        }}
        maxLength={20}
        placeholder="Enter your name..."
        className={`mt-2 ${INPUT}`}
      />

      <button
        onClick={() => runRoomAction("room:create", { type: "private" })}
        disabled={loading || !socketConnected}
        className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
      >
        {loading ? "Please wait..." : "Create Private Room"}
      </button>

      <div className="my-6 flex items-center gap-4">
        <div className="h-0.5 flex-1 rounded bg-slate-200" />
        <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
        <div className="h-0.5 flex-1 rounded bg-slate-200" />
      </div>

      <div className="flex gap-3">
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              joinRoom();
            }
          }}
          placeholder="Enter room code"
          className={`min-w-0 flex-1 uppercase ${INPUT}`}
        />

        <button
          onClick={joinRoom}
          disabled={loading || !socketConnected || !roomCode.trim()}
          className={`px-5 py-3 ${BTN_SUCCESS}`}
        >
          Join
        </button>
      </div>

      <button
        onClick={() => runRoomAction("matchmaking:join")}
        disabled={loading || !socketConnected}
        className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
      >
        ⚡ Quick Match
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Final results screen                                                       */
/* -------------------------------------------------------------------------- */

function sortLeaderboard(leaderboard, winnerId) {
  return [...(leaderboard || [])].sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    if (a.playerId === winnerId) return -1;
    if (b.playerId === winnerId) return 1;
    return 0;
  });
}

function FinalResultsScreen({
  room,
  finalResults,
  rematchState,
  isHost,
  socketConnected,
  onRequestRematch,
  onStartRematch,
}) {
  const winnerId = finalResults.winner?.playerId;

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
      <div className="text-center">
        <div className="text-6xl">🏆</div>

        <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
          SkribblPlay Champion
        </p>

        <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
          Game Over!
        </h2>

        {finalResults.winner ? (
          <>
            <p className="mt-6 text-slate-500">Congratulations to</p>

            <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
              👑 {finalResults.winner.username}
            </h3>

            <p className="mt-3 text-xl font-bold text-green-600">
              {finalResults.winner.score} points
            </p>
          </>
        ) : (
          <p className="mt-6 text-slate-600">
            Game finished, but no winner could be determined.
          </p>
        )}

        <p className="mt-3 text-sm text-slate-500">
          All {room.maxRounds} rounds completed!
        </p>
      </div>

      <div className="mt-10">
        <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

        <div className="mt-4 space-y-3">
          {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
            const isWinner = player.playerId === winnerId;

            return (
              <div
                key={player.playerId}
                className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
                  isWinner
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-800">
                      {player.username}
                      {isWinner && (
                        <span className="ml-2 text-amber-500">👑 Winner</span>
                      )}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 font-bold text-green-600">
                  {player.score} pts
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-slate-500">
        Thanks for playing ScribblePlay! 🎨
      </p>

      <div className="mt-6 flex flex-col items-center gap-4">
        <button
          onClick={onRequestRematch}
          disabled={!socketConnected}
          className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
        >
          Play Again
        </button>

        <p className="text-sm text-slate-500">
          Players ready: {rematchState.readyCount}
        </p>

        {isHost && (
          <button
            onClick={onStartRematch}
            disabled={!socketConnected || rematchState.readyCount < 2}
            className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
          >
            Start Rematch
          </button>
        )}

        <p className="text-center text-xs text-slate-400">
          At least 2 players must click Play Again. Only ready players will join the
          next game.
        </p>

        {rematchState.players.length > 0 && (
          <div className="w-full rounded-xl border-2 border-slate-200 p-4">
            <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

            {rematchState.players.map((player) => (
              <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
                ✓ {player.username}
                {player.isHost ? " (Host)" : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Lobby components                                                           */
/* -------------------------------------------------------------------------- */

function getRoomTitle(room) {
  if (room.status === "waiting") return "Waiting Lobby";
  if (room.status === "finished") return "Game Finished";
  return `Round ${room.round} of ${room.maxRounds}`;
}

function RoomCodeCard({ roomCode, onCopy }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
      <div>
        <p className="text-sm font-semibold text-slate-500">Room Code</p>
        <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
          {roomCode || "N/A"}
        </p>
      </div>

      <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
        Copy Code
      </button>
    </div>
  );
}

function PlayersList({ room }) {
  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-800">Players</h3>
        <span className="text-sm font-semibold text-slate-500">
          {room.players?.length || 0}/{room.maxPlayers || 8}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(room.players || []).map((player) => (
          <div
            key={player.playerId}
            className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
                {player.username?.charAt(0).toUpperCase() || "P"}
              </div>

              <div>
                <p className="font-semibold text-slate-800">{player.username}</p>

                {player.isHost && (
                  <p className="text-xs font-semibold text-amber-500">Room Host</p>
                )}

                <p className="text-sm font-semibold text-green-600">
                  {player.score ?? 0} pts
                </p>
              </div>
            </div>

            <span
              className={`text-xs font-semibold ${
                player.connected ? "text-green-600" : "text-slate-400"
              }`}
            >
              {player.connected ? "Online" : "Reconnecting..."}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameSettingsPanel({ isHost, disabled, settings }) {
  const selectDisabled = !isHost || disabled;

  return (
    <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
      <p className="mt-1 text-sm text-slate-500">
        {isHost
          ? "Choose the settings before starting the game."
          : "The host has selected these settings for the game."}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SettingSelect
          id="maxPlayers"
          label="Maximum Players"
          value={settings.maxPlayers}
          onChange={settings.setMaxPlayers}
          disabled={selectDisabled}
          options={SETTINGS_OPTIONS.maxPlayers}
          formatLabel={(n) => `${n} players`}
        />

        <SettingSelect
          id="rounds"
          label="Number of Rounds"
          value={settings.rounds}
          onChange={settings.setRounds}
          disabled={selectDisabled}
          options={SETTINGS_OPTIONS.rounds}
          formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
        />

        <SettingSelect
          id="drawTime"
          label="Drawing Time"
          value={settings.drawTime}
          onChange={settings.setDrawTime}
          disabled={selectDisabled}
          options={SETTINGS_OPTIONS.drawTime}
          formatLabel={(n) => `${n} seconds`}
        />

        <SettingSelect
          id="wordChoiceCount"
          label="Word Choices per Turn"
          value={settings.wordChoiceCount}
          onChange={settings.setWordChoiceCount}
          disabled={selectDisabled}
          options={SETTINGS_OPTIONS.wordChoiceCount}
          formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
        />

        <SettingSelect
          id="hintCount"
          label="Hints per Turn"
          value={settings.hintCount}
          onChange={settings.setHintCount}
          disabled={selectDisabled}
          options={SETTINGS_OPTIONS.hintCount}
          formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
        />
      </div>

      {!isHost && (
        <p className="mt-3 text-xs text-slate-400">
          Only the room host can change the settings.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Game play components                                                       */
/* -------------------------------------------------------------------------- */

function ScoreBoard({ room }) {
  const players = room.players || [];

  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="font-bold text-slate-800">Players</h3>
        <span className="text-xs font-semibold text-slate-500">
          {players.length}/{room.maxPlayers || 8}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {players.map((player) => {
          const isCurrentDrawer = player.playerId === room.currentDrawer;

          return (
            <div
              key={player.playerId}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
                isCurrentDrawer
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
                {player.username?.charAt(0).toUpperCase() || "P"}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {player.username}
                  {isCurrentDrawer && " ✏️"}
                </p>
                <p className="text-xs font-semibold text-green-600">
                  {player.score ?? 0} pts
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {player.isHost && (
                  <span className="text-xs" title="Room Host">
                    👑
                  </span>
                )}
                <span
                  className={`h-2 w-2 rounded-full ${
                    player.connected ? "bg-green-500" : "bg-slate-300"
                  }`}
                  title={player.connected ? "Online" : "Reconnecting..."}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordChoicePanel({ isDrawer, drawerName, wordChoices, onChooseWord }) {
  return (
    <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
      <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

      <h3 className="mt-3 text-2xl font-bold text-blue-600">
        {isDrawer
          ? "Choose a word!"
          : `${drawerName || "The drawer"} is choosing a word...`}
      </h3>

      {isDrawer && wordChoices.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {wordChoices.map((word) => (
            <button
              key={word}
              onClick={() => onChooseWord(word)}
              className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
            >
              {word}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WordHintBanner({
  isDrawer,
  selectedWord,
  hintsRevealed,
  totalHints,
  hintCount,
  currentHint,
}) {
  if (isDrawer) {
    return (
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Your word
        </p>
        <p className="text-2xl font-bold text-blue-600">
          {selectedWord || "Loading..."}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
        {currentHint
          ? currentHint.trim().split(/\s+/).filter(Boolean).length
          : "—"}{" "}
        letters
      </p>
      <p className="text-2xl font-bold tracking-widest text-slate-800">
        {currentHint || "Waiting for hint..."}
      </p>
    </div>
  );
}

function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
  const messagesEndRef = useRef(null);

  // Keep the newest message in view inside the chat box.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatMessages]);

  return (
    <div className={PANEL}>
      <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
        💬 Guessing Chat
      </h3>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {chatMessages.map((msg, index) => {
          const isCorrect = msg.username?.startsWith("🎉");

          return (
            <p
              key={`${msg.createdAt}-${index}`}
              className={`break-words rounded-lg px-2 py-1 text-sm ${
                isCorrect
                  ? "bg-green-100 font-semibold text-green-700"
                  : index % 2 === 0
                    ? "bg-slate-50 text-slate-700"
                    : "text-slate-700"
              }`}
            >
              <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
                {msg.username}:
              </span>{" "}
              {msg.message}
            </p>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {canGuess && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitGuess();
          }}
          className="flex gap-2 border-t-2 border-slate-100 p-3"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={100}
            placeholder="Guess the word..."
            className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
          />

          <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function App() {
  const socket = useSocket();
  const dispatch = useDispatch();

  const { socketConnected, room, error } = useSelector((state) => state.game);

  const playerId = sessionStorage.getItem("scribblePlayerId");

  const isHost = room?.players?.some(
    (player) => player.playerId === playerId && player.isHost
  );

  const isDrawer = room?.currentDrawer === playerId;

  /* ----- Local state ----- */

  const [username, setUsername] = useState(
    () => sessionStorage.getItem("scribbleUsername") || ""
  );
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [wordChoices, setWordChoices] = useState([]);
  const [selectedWord, setSelectedWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [finalResults, setFinalResults] = useState(null);
  const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

  const [selectedRounds, setSelectedRounds] = useState(3);
  const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
  const [selectedDrawTime, setSelectedDrawTime] = useState(60);
  const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
  const [selectedHintCount, setSelectedHintCount] = useState(0);

  const [currentHint, setCurrentHint] = useState("");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [totalHints, setTotalHints] = useState(0);

  /* ----- Socket event listeners ----- */

  useEffect(() => {
    if (!socket) return;

    const handleWordChoices = (choices) => {
      setWordChoices(Array.isArray(choices) ? choices : []);
      setSelectedWord("");
    };

    const handleWordSelected = (data) => {
      setSelectedWord(data.word);
      setWordChoices([]);
    };

    const handleGameHint = (data) => {
      setCurrentHint(data?.hint || "");
      setHintsRevealed(data?.hintsRevealed || 0);
      setTotalHints(data?.hintCount ?? 0);
    };

    const handleHintReset = (data) => {
      setCurrentHint(data?.hint || "");
      setHintsRevealed(0);
      setTotalHints(data?.hintCount ?? 0);
      setSelectedWord("");
    };

    const handleChatMessage = (message) => {
      setChatMessages((prev) => [...prev, message]);
    };

    const handleCorrectGuess = (data) => {
      setChatMessages((prev) => [
        ...prev,
        {
          playerId: data.playerId,
          username: "🎉 " + data.username,
          message: `guessed correctly! +${data.points} points`,
          createdAt: Date.now(),
        },
      ]);
    };

    const handleGameFinished = (data) => {
      setFinalResults(data);
    };

    const handleRematchState = (data) => {
      setRematchState({
        players: data.players || [],
        readyCount: data.readyCount || 0,
      });
    };

    const handleRematchStarted = () => {
      setFinalResults(null);
      setRematchState({ players: [], readyCount: 0 });
      setWordChoices([]);
      setSelectedWord("");
      setChatMessages([]);
      setChatInput("");
      setTimeLeft(DEFAULT_TIME_LEFT);
    };

    const handleRoomClosed = () => {
      dispatch(clearRoom());
      setFinalResults(null);
      setRematchState({ readyCount: 0, players: [] });
      setWordChoices([]);
      setChatMessages([]);
      setTimeLeft(DEFAULT_TIME_LEFT);
    };

    socket.on("chat:message", handleChatMessage);
    socket.on("game:word-choices", handleWordChoices);
    socket.on("game:word-selected", handleWordSelected);
    socket.on("game:hint", handleGameHint);
    socket.on("game:hint-reset", handleHintReset);
    socket.on("game:correct-guess", handleCorrectGuess);
    socket.on("game:finished", handleGameFinished);
    socket.on("rematch:state", handleRematchState);
    socket.on("rematch:started", handleRematchStarted);
    socket.on("room:closed", handleRoomClosed);

    return () => {
      socket.off("game:word-choices", handleWordChoices);
      socket.off("game:word-selected", handleWordSelected);
      socket.off("game:hint", handleGameHint);
      socket.off("game:hint-reset", handleHintReset);
      socket.off("chat:message", handleChatMessage);
      socket.off("game:correct-guess", handleCorrectGuess);
      socket.off("game:finished", handleGameFinished);
      socket.off("rematch:state", handleRematchState);
      socket.off("rematch:started", handleRematchStarted);
      socket.off("room:closed", handleRoomClosed);
    };
  }, [socket]);

  /* ----- Turn timer ----- */

  useEffect(() => {
    if (room?.status !== "drawing" || !room?.turnEndsAt) {
      setTimeLeft(DEFAULT_TIME_LEFT);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((room.turnEndsAt - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
    };

    updateTimer();

    const intervalId = setInterval(updateTimer, 250);

    return () => clearInterval(intervalId);
  }, [room?.status, room?.turnEndsAt]);

  /* ----- Ask again for word choices if they did not arrive ----- */

  useEffect(() => {
    if (!socket || room?.status !== "choosing" || !isDrawer || wordChoices.length > 0) {
      return;
    }

    socket.emit("game:request-word-choices");
  }, [socket, room?.status, isDrawer, wordChoices.length]);

  /* ----- Action handlers ----- */

  // Emits an event that only needs an error message when it fails.
  const emitSimpleAction = (eventName, fallbackMessage, payload) => {
    const handleResponse = (response) => {
      if (!response?.success) {
        dispatch(setError(response?.message || fallbackMessage));
      }
    };

    if (payload === undefined) {
      socket.emit(eventName, handleResponse);
    } else {
      socket.emit(eventName, payload, handleResponse);
    }
  };

  const handleStartGame = () => {
    if (!socket?.connected) {
      dispatch(setError(MESSAGES.notConnected));
      return;
    }

    dispatch(setError(""));

    emitSimpleAction("game:start", MESSAGES.startGameFailed, {
      rounds: selectedRounds,
      maxPlayers: selectedMaxPlayers,
      drawTime: selectedDrawTime,
      wordChoiceCount: selectedWordChoiceCount,
      hintCount: selectedHintCount,
    });
  };

  const handleRequestRematch = () => {
    if (!socket?.connected) {
      dispatch(setError(MESSAGES.notConnected));
      return;
    }

    emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
  };

  const handleStartRematch = () => {
    if (!socket?.connected) {
      dispatch(setError(MESSAGES.notConnected));
      return;
    }

    emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
  };

  const handleChooseWord = (word) => {
    emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
  };

  const handleSubmitGuess = () => {
    const message = chatInput.trim();

    if (!message || !socket) return;

    emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

    setChatInput("");
  };

  const runRoomAction = (eventName, payload = {}) => {
    if (!socket?.connected) {
      dispatch(setError(MESSAGES.notConnectedWait));
      return;
    }

    if (!username.trim()) {
      dispatch(setError(MESSAGES.usernameRequired));
      return;
    }

    setLoading(true);
    dispatch(setError(""));

    // If the server never answers, stop the "Please wait..." state and say so.
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      dispatch(setError("The server did not respond. Please try again."));
    }, 10000);

    socket.emit(
      eventName,
      { ...payload, username: username.trim() },
      (response) => {
        clearTimeout(timeoutId);

        // A late answer is ignored; the room:state event updates the screen anyway.
        if (timedOut) return;

        setLoading(false);

        if (!response?.success) {
          dispatch(setError(response?.message || MESSAGES.requestFailed));
          return;
        }

        sessionStorage.setItem("scribbleUsername", username.trim());

        if (response.data) {
          dispatch(setRoom(response.data));
        }
      }
    );
  };

  const leaveRoom = () => {
    // Always release the loading state when returning to the home screen.
    setLoading(false);
    dispatch(setError(""));

    if (socket?.connected) {
      socket.emit("room:leave", {}, (response) => {
        if (response && response.success === false) {
          dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
        }
        setLoading(false);
      });
    }

    dispatch(clearRoom());
    setWordChoices([]);
    setSelectedWord("");
    setCurrentHint("");
    setHintsRevealed(0);
    setTotalHints(0);
    setChatMessages([]);
    setChatInput("");
    setFinalResults(null);
    setRematchState(INITIAL_REMATCH_STATE);
    setTimeLeft(DEFAULT_TIME_LEFT);
  };

  const copyRoomCode = async () => {
    if (!room?.roomCode) return;

    try {
      await navigator.clipboard.writeText(room.roomCode);
      dispatch(setError(""));
    } catch {
      dispatch(setError(MESSAGES.copyFailed));
    }
  };

  /* ----- Derived values ----- */

  const settings = {
    maxPlayers: selectedMaxPlayers,
    setMaxPlayers: setSelectedMaxPlayers,
    rounds: selectedRounds,
    setRounds: setSelectedRounds,
    drawTime: selectedDrawTime,
    setDrawTime: setSelectedDrawTime,
    wordChoiceCount: selectedWordChoiceCount,
    setWordChoiceCount: setSelectedWordChoiceCount,
    hintCount: selectedHintCount,
    setHintCount: setSelectedHintCount,
  };

  const isDrawing = room?.status === "drawing";
  const canDraw = isDrawer && isDrawing;
  const isGameScreen = GAME_STATUSES.includes(room?.status);

  /* ----- Screens ----- */

  const renderLobbyScreen = () => (
    <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-green-600">
            Room created
          </p>

          <h2 className="mt-2 text-3xl font-bold text-slate-800">
            {getRoomTitle(room)}
          </h2>

          <p className="mt-2 text-slate-500">
            {room.status === "waiting"
              ? "Share the room code with your friends."
              : "Draw · Guess · Win"}
          </p>
        </div>

        <button
          onClick={leaveRoom}
          disabled={loading}
          className={`px-4 py-2 text-sm ${BTN_DANGER}`}
        >
          Leave Room
        </button>
      </div>

      <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

      <PlayersList room={room} />

      <div className="mt-8 flex flex-col items-center gap-4">
        {room.status === "waiting" && (
          <GameSettingsPanel
            isHost={isHost}
            disabled={loading || !socketConnected}
            settings={settings}
          />
        )}

        {room.status === "waiting" && isHost && (
          <button
            onClick={handleStartGame}
            disabled={
              loading ||
              !socketConnected ||
              room.players?.filter((p) => p.connected).length < 2
            }
            className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
          >
            Start Game
          </button>
        )}

        {room.status === "waiting" && (
          <p className="text-center text-sm text-slate-500">
            The host can start the game. At least 2 players are required.
          </p>
        )}
      </div>
    </section>
  );

  const renderGameScreen = () => (
    <section>
      {/* Top bar: timer, word / hint, round info */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
              isDrawing && timeLeft <= 10
                ? "border-rose-500 text-rose-600"
                : "border-blue-500 text-blue-600"
            }`}
          >
            {isDrawing ? timeLeft : "⏱️"}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Time Left
            </p>
            <p className="text-lg font-bold text-slate-800">
              {isDrawing ? `${timeLeft}s` : "—"}
            </p>
          </div>
        </div>

        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          {isDrawing ? (
            <WordHintBanner
              isDrawer={isDrawer}
              selectedWord={selectedWord}
              hintsRevealed={hintsRevealed}
              totalHints={totalHints}
              hintCount={room.hintCount}
              currentHint={currentHint}
            />
          ) : (
            <p className="text-center text-lg font-bold text-slate-600">
              {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
            </p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
            <p className="text-xs font-semibold tracking-widest text-slate-400">
              {room.roomCode}
            </p>
          </div>

          <button
            onClick={leaveRoom}
            disabled={loading}
            className={`px-3 py-2 text-sm ${BTN_DANGER}`}
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
        <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
          <div className="h-full lg:absolute lg:inset-0">
            <ScoreBoard room={room} />
          </div>
        </div>

        <div className="order-1 min-w-0 lg:order-none">
          {room.status === "choosing" && (
            <WordChoicePanel
              isDrawer={isDrawer}
              drawerName={
                room.players?.find((p) => p.playerId === room.currentDrawer)?.username
              }
              wordChoices={wordChoices}
              onChooseWord={handleChooseWord}
            />
          )}

          {(isDrawing || room.status === "round-ended") && (
            <>
              {room.status === "round-ended" && (
                <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
                  ⏰ Round has ended!
                </div>
              )}

              <DrawingCanvas socket={socket} isDrawer={canDraw} />
            </>
          )}
        </div>

        <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
          <div className="h-full lg:absolute lg:inset-0">
            <GuessingChat
              chatMessages={chatMessages}
              chatInput={chatInput}
              setChatInput={setChatInput}
              canGuess={!isDrawer && isDrawing}
              onSubmitGuess={handleSubmitGuess}
            />
          </div>
        </div>
      </div>
    </section>
  );

  /* ----- Render ----- */

  return (
    <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
      <Header socketConnected={socketConnected} />

      <main className="mx-auto mt-8 max-w-6xl">
        {error && <ErrorBanner error={error} />}

        {!room ? (
          <HomeScreen
            username={username}
            setUsername={setUsername}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            loading={loading}
            socketConnected={socketConnected}
            runRoomAction={runRoomAction}
          />
        ) : finalResults ? (
          <FinalResultsScreen
            room={room}
            finalResults={finalResults}
            rematchState={rematchState}
            isHost={isHost}
            socketConnected={socketConnected}
            onRequestRematch={handleRequestRematch}
            onStartRematch={handleStartRematch}
          />
        ) : isGameScreen ? (
          renderGameScreen()
        ) : (
          renderLobbyScreen()
        )}
      </main>
    </div>
  );
}







































// import { useEffect, useRef, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// // Room statuses that show the game play area instead of the lobby.
// const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

// /* Shared styles (light, chunky "game" look) */
// const BTN_BASE =
//   "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
// const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
// const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
// const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

// const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
// const PANEL =
//   "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
// const INPUT =
//   "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-6xl items-center justify-between">
//       <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
//         Skribbl<span className="text-pink-500">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-500" : "bg-rose-500"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Home screen                                                                */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
//       <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
//         Ready to doodle? ✏️
//       </h2>

//       <p className="mt-3 leading-7 text-slate-500">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-700"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className={`mt-2 ${INPUT}`}
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//         <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className={`min-w-0 flex-1 uppercase ${INPUT}`}
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className={`px-5 py-3 ${BTN_SUCCESS}`}
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
//       >
//         ⚡ Quick Match
//       </button>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Final results screen                                                       */
// /* -------------------------------------------------------------------------- */

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
//           SkribblPlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
//           Game Over!
//         </h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-500">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-600">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-600">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-500">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
//                   isWinner
//                     ? "border-amber-300 bg-amber-50"
//                     : "border-slate-200 bg-slate-50"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold text-slate-800">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-500">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-600">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-500">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-500">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-400">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border-2 border-slate-200 p-4">
//             <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby components                                                           */
// /* -------------------------------------------------------------------------- */

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
//       <div>
//         <p className="text-sm font-semibold text-slate-500">Room Code</p>
//         <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold text-slate-800">Players</h3>
//         <span className="text-sm font-semibold text-slate-500">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold text-slate-800">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs font-semibold text-amber-500">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs font-semibold ${
//                 player.connected ? "text-green-600" : "text-slate-400"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
//       <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-500">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-400">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Game play components                                                       */
// /* -------------------------------------------------------------------------- */

// function ScoreBoard({ room }) {
//   const players = room.players || [];

//   return (
//     <div className={PANEL}>
//       <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//         <h3 className="font-bold text-slate-800">Players</h3>
//         <span className="text-xs font-semibold text-slate-500">
//           {players.length}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
//         {players.map((player) => {
//           const isCurrentDrawer = player.playerId === room.currentDrawer;

//           return (
//             <div
//               key={player.playerId}
//               className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
//                 isCurrentDrawer
//                   ? "border-blue-300 bg-blue-50"
//                   : "border-slate-100 bg-white"
//               }`}
//             >
//               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div className="min-w-0 flex-1">
//                 <p className="truncate text-sm font-semibold text-slate-800">
//                   {player.username}
//                   {isCurrentDrawer && " ✏️"}
//                 </p>
//                 <p className="text-xs font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>

//               <div className="flex shrink-0 flex-col items-end gap-0.5">
//                 {player.isHost && (
//                   <span className="text-xs" title="Room Host">
//                     👑
//                   </span>
//                 )}
//                 <span
//                   className={`h-2 w-2 rounded-full ${
//                     player.connected ? "bg-green-500" : "bg-slate-300"
//                   }`}
//                   title={player.connected ? "Online" : "Reconnecting..."}
//                 />
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, drawerName, wordChoices, onChooseWord }) {
//   return (
//     <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
//       <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

//       <h3 className="mt-3 text-2xl font-bold text-blue-600">
//         {isDrawer
//           ? "Choose a word!"
//           : `${drawerName || "The drawer"} is choosing a word...`}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-6 flex flex-wrap justify-center gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({
//   isDrawer,
//   selectedWord,
//   hintsRevealed,
//   totalHints,
//   hintCount,
//   currentHint,
// }) {
//   if (isDrawer) {
//     return (
//       <div className="text-center">
//         <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//           Your word
//         </p>
//         <p className="text-2xl font-bold text-blue-600">
//           {selectedWord || "Loading..."}
//         </p>
//       </div>
//     );
//   }

//   return (
//     <div className="text-center">
//       <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//         Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
//         {currentHint
//           ? currentHint.trim().split(/\s+/).filter(Boolean).length
//           : "—"}{" "}
//         letters
//       </p>
//       <p className="text-2xl font-bold tracking-widest text-slate-800">
//         {currentHint || "Waiting for hint..."}
//       </p>
//     </div>
//   );
// }

// function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
//   const messagesEndRef = useRef(null);

//   // Keep the newest message in view inside the chat box.
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ block: "nearest" });
//   }, [chatMessages]);

//   return (
//     <div className={PANEL}>
//       <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
//         💬 Guessing Chat
//       </h3>

//       <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
//         {chatMessages.map((msg, index) => {
//           const isCorrect = msg.username?.startsWith("🎉");

//           return (
//             <p
//               key={`${msg.createdAt}-${index}`}
//               className={`break-words rounded-lg px-2 py-1 text-sm ${
//                 isCorrect
//                   ? "bg-green-100 font-semibold text-green-700"
//                   : index % 2 === 0
//                     ? "bg-slate-50 text-slate-700"
//                     : "text-slate-700"
//               }`}
//             >
//               <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
//                 {msg.username}:
//               </span>{" "}
//               {msg.message}
//             </p>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2 border-t-2 border-slate-100 p-3"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
//           />

//           <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Ask again for word choices if they did not arrive ----- */

//   useEffect(() => {
//     if (!socket || room?.status !== "choosing" || !isDrawer || wordChoices.length > 0) {
//       return;
//     }

//     socket.emit("game:request-word-choices");
//   }, [socket, room?.status, isDrawer, wordChoices.length]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;
//   const isGameScreen = GAME_STATUSES.includes(room?.status);

//   /* ----- Screens ----- */

//   const renderLobbyScreen = () => (
//     <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-bold uppercase tracking-widest text-green-600">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold text-slate-800">
//             {getRoomTitle(room)}
//           </h2>

//           <p className="mt-2 text-slate-500">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className={`px-4 py-2 text-sm ${BTN_DANGER}`}
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-500">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}
//       </div>
//     </section>
//   );

//   const renderGameScreen = () => (
//     <section>
//       {/* Top bar: timer, word / hint, round info */}
//       <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
//         <div className="flex items-center gap-3">
//           <div
//             className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
//               isDrawing && timeLeft <= 10
//                 ? "border-rose-500 text-rose-600"
//                 : "border-blue-500 text-blue-600"
//             }`}
//           >
//             {isDrawing ? timeLeft : "⏱️"}
//           </div>

//           <div>
//             <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//               Time Left
//             </p>
//             <p className="text-lg font-bold text-slate-800">
//               {isDrawing ? `${timeLeft}s` : "—"}
//             </p>
//           </div>
//         </div>

//         <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
//           {isDrawing ? (
//             <WordHintBanner
//               isDrawer={isDrawer}
//               selectedWord={selectedWord}
//               hintsRevealed={hintsRevealed}
//               totalHints={totalHints}
//               hintCount={room.hintCount}
//               currentHint={currentHint}
//             />
//           ) : (
//             <p className="text-center text-lg font-bold text-slate-600">
//               {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
//             </p>
//           )}
//         </div>

//         <div className="ml-auto flex items-center gap-3">
//           <div className="text-right">
//             <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
//             <p className="text-xs font-semibold tracking-widest text-slate-400">
//               {room.roomCode}
//             </p>
//           </div>

//           <button
//             onClick={leaveRoom}
//             disabled={loading}
//             className={`px-3 py-2 text-sm ${BTN_DANGER}`}
//           >
//             Leave Room
//           </button>
//         </div>
//       </div>

//       {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
//       <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
//         <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <ScoreBoard room={room} />
//           </div>
//         </div>

//         <div className="order-1 min-w-0 lg:order-none">
//           {room.status === "choosing" && (
//             <WordChoicePanel
//               isDrawer={isDrawer}
//               drawerName={
//                 room.players?.find((p) => p.playerId === room.currentDrawer)?.username
//               }
//               wordChoices={wordChoices}
//               onChooseWord={handleChooseWord}
//             />
//           )}

//           {(isDrawing || room.status === "round-ended") && (
//             <>
//               {room.status === "round-ended" && (
//                 <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
//                   ⏰ Round has ended!
//                 </div>
//               )}

//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </>
//           )}
//         </div>

//         <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </div>
//         </div>
//       </div>
//     </section>
//   );

//   /* ----- Render ----- */

//   return (
//     <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-8 max-w-6xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : isGameScreen ? (
//           renderGameScreen()
//         ) : (
//           renderLobbyScreen()
//         )}
//       </main>
//     </div>
//   );
// }






































// import { useEffect, useRef, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// // Room statuses that show the game play area instead of the lobby.
// const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

// /* Shared styles (light, chunky "game" look) */
// const BTN_BASE =
//   "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
// const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
// const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
// const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

// const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
// const PANEL =
//   "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
// const INPUT =
//   "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-6xl items-center justify-between">
//       <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
//         Skribbl<span className="text-pink-500">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-500" : "bg-rose-500"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Home screen                                                                */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
//       <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
//         Ready to doodle? ✏️
//       </h2>

//       <p className="mt-3 leading-7 text-slate-500">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-700"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className={`mt-2 ${INPUT}`}
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//         <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className={`min-w-0 flex-1 uppercase ${INPUT}`}
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className={`px-5 py-3 ${BTN_SUCCESS}`}
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
//       >
//         ⚡ Quick Match
//       </button>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Final results screen                                                       */
// /* -------------------------------------------------------------------------- */

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
//           SlribblPlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
//           Game Over!
//         </h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-500">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-600">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-600">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-500">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
//                   isWinner
//                     ? "border-amber-300 bg-amber-50"
//                     : "border-slate-200 bg-slate-50"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold text-slate-800">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-500">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-600">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-500">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-500">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-400">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border-2 border-slate-200 p-4">
//             <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby components                                                           */
// /* -------------------------------------------------------------------------- */

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
//       <div>
//         <p className="text-sm font-semibold text-slate-500">Room Code</p>
//         <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold text-slate-800">Players</h3>
//         <span className="text-sm font-semibold text-slate-500">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold text-slate-800">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs font-semibold text-amber-500">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs font-semibold ${
//                 player.connected ? "text-green-600" : "text-slate-400"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
//       <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-500">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-400">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Game play components                                                       */
// /* -------------------------------------------------------------------------- */

// function ScoreBoard({ room }) {
//   const players = room.players || [];

//   return (
//     <div className={PANEL}>
//       <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//         <h3 className="font-bold text-slate-800">Players</h3>
//         <span className="text-xs font-semibold text-slate-500">
//           {players.length}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
//         {players.map((player) => {
//           const isCurrentDrawer = player.playerId === room.currentDrawer;

//           return (
//             <div
//               key={player.playerId}
//               className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
//                 isCurrentDrawer
//                   ? "border-blue-300 bg-blue-50"
//                   : "border-slate-100 bg-white"
//               }`}
//             >
//               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div className="min-w-0 flex-1">
//                 <p className="truncate text-sm font-semibold text-slate-800">
//                   {player.username}
//                   {isCurrentDrawer && " ✏️"}
//                 </p>
//                 <p className="text-xs font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>

//               <div className="flex shrink-0 flex-col items-end gap-0.5">
//                 {player.isHost && (
//                   <span className="text-xs" title="Room Host">
//                     👑
//                   </span>
//                 )}
//                 <span
//                   className={`h-2 w-2 rounded-full ${
//                     player.connected ? "bg-green-500" : "bg-slate-300"
//                   }`}
//                   title={player.connected ? "Online" : "Reconnecting..."}
//                 />
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, drawerName, wordChoices, onChooseWord }) {
//   return (
//     <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
//       <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

//       <h3 className="mt-3 text-2xl font-bold text-blue-600">
//         {isDrawer
//           ? "Choose a word!"
//           : `${drawerName || "The drawer"} is choosing a word...`}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-6 flex flex-wrap justify-center gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({
//   isDrawer,
//   selectedWord,
//   hintsRevealed,
//   totalHints,
//   hintCount,
//   currentHint,
// }) {
//   if (isDrawer) {
//     return (
//       <div className="text-center">
//         <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//           Your word
//         </p>
//         <p className="text-2xl font-bold text-blue-600">
//           {selectedWord || "Loading..."}
//         </p>
//       </div>
//     );
//   }

//   return (
//     <div className="text-center">
//       <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//         Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
//         {currentHint
//           ? currentHint.trim().split(/\s+/).filter(Boolean).length
//           : "—"}{" "}
//         letters
//       </p>
//       <p className="text-2xl font-bold tracking-widest text-slate-800">
//         {currentHint || "Waiting for hint..."}
//       </p>
//     </div>
//   );
// }

// function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
//   const messagesEndRef = useRef(null);

//   // Keep the newest message in view inside the chat box.
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ block: "nearest" });
//   }, [chatMessages]);

//   return (
//     <div className={PANEL}>
//       <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
//         💬 Guessing Chat
//       </h3>

//       <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
//         {chatMessages.map((msg, index) => {
//           const isCorrect = msg.username?.startsWith("🎉");

//           return (
//             <p
//               key={`${msg.createdAt}-${index}`}
//               className={`break-words rounded-lg px-2 py-1 text-sm ${
//                 isCorrect
//                   ? "bg-green-100 font-semibold text-green-700"
//                   : index % 2 === 0
//                     ? "bg-slate-50 text-slate-700"
//                     : "text-slate-700"
//               }`}
//             >
//               <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
//                 {msg.username}:
//               </span>{" "}
//               {msg.message}
//             </p>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2 border-t-2 border-slate-100 p-3"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
//           />

//           <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Ask again for word choices if they did not arrive ----- */

//   useEffect(() => {
//     if (!socket || room?.status !== "choosing" || !isDrawer || wordChoices.length > 0) {
//       return;
//     }

//     socket.emit("game:request-word-choices");
//   }, [socket, room?.status, isDrawer, wordChoices.length]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;
//   const isGameScreen = GAME_STATUSES.includes(room?.status);

//   /* ----- Screens ----- */

//   const renderLobbyScreen = () => (
//     <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-bold uppercase tracking-widest text-green-600">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold text-slate-800">
//             {getRoomTitle(room)}
//           </h2>

//           <p className="mt-2 text-slate-500">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className={`px-4 py-2 text-sm ${BTN_DANGER}`}
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-500">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}
//       </div>
//     </section>
//   );

//   const renderGameScreen = () => (
//     <section>
//       {/* Top bar: timer, word / hint, round info */}
//       <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
//         <div className="flex items-center gap-3">
//           <div
//             className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
//               isDrawing && timeLeft <= 10
//                 ? "border-rose-500 text-rose-600"
//                 : "border-blue-500 text-blue-600"
//             }`}
//           >
//             {isDrawing ? timeLeft : "⏱️"}
//           </div>

//           <div>
//             <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//               Time Left
//             </p>
//             <p className="text-lg font-bold text-slate-800">
//               {isDrawing ? `${timeLeft}s` : "—"}
//             </p>
//           </div>
//         </div>

//         <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
//           {isDrawing ? (
//             <WordHintBanner
//               isDrawer={isDrawer}
//               selectedWord={selectedWord}
//               hintsRevealed={hintsRevealed}
//               totalHints={totalHints}
//               hintCount={room.hintCount}
//               currentHint={currentHint}
//             />
//           ) : (
//             <p className="text-center text-lg font-bold text-slate-600">
//               {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
//             </p>
//           )}
//         </div>

//         <div className="ml-auto flex items-center gap-3">
//           <div className="text-right">
//             <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
//             <p className="text-xs font-semibold tracking-widest text-slate-400">
//               {room.roomCode}
//             </p>
//           </div>

//           <button
//             onClick={leaveRoom}
//             disabled={loading}
//             className={`px-3 py-2 text-sm ${BTN_DANGER}`}
//           >
//             Leave Room
//           </button>
//         </div>
//       </div>

//       {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
//       <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
//         <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <ScoreBoard room={room} />
//           </div>
//         </div>

//         <div className="order-1 min-w-0 lg:order-none">
//           {room.status === "choosing" && (
//             <WordChoicePanel
//               isDrawer={isDrawer}
//               drawerName={
//                 room.players?.find((p) => p.playerId === room.currentDrawer)?.username
//               }
//               wordChoices={wordChoices}
//               onChooseWord={handleChooseWord}
//             />
//           )}

//           {(isDrawing || room.status === "round-ended") && (
//             <>
//               {room.status === "round-ended" && (
//                 <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
//                   ⏰ Round has ended!
//                 </div>
//               )}

//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </>
//           )}
//         </div>

//         <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </div>
//         </div>
//       </div>
//     </section>
//   );

//   /* ----- Render ----- */

//   return (
//     <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-8 max-w-6xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : isGameScreen ? (
//           renderGameScreen()
//         ) : (
//           renderLobbyScreen()
//         )}
//       </main>
//     </div>
//   );
// }










































// import { useEffect, useRef, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// // Room statuses that show the game play area instead of the lobby.
// const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

// /* Shared styles (light, chunky "game" look) */
// const BTN_BASE =
//   "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
// const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
// const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
// const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

// const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
// const PANEL =
//   "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
// const INPUT =
//   "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-6xl items-center justify-between">
//       <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
//         Scribble<span className="text-pink-500">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-500" : "bg-rose-500"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Home screen                                                                */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
//       <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
//         Ready to doodle? ✏️
//       </h2>

//       <p className="mt-3 leading-7 text-slate-500">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-700"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className={`mt-2 ${INPUT}`}
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//         <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className={`min-w-0 flex-1 uppercase ${INPUT}`}
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className={`px-5 py-3 ${BTN_SUCCESS}`}
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
//       >
//         ⚡ Quick Match
//       </button>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Final results screen                                                       */
// /* -------------------------------------------------------------------------- */

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
//           SkribblPlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
//           Game Over!
//         </h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-500">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-600">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-600">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-500">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
//                   isWinner
//                     ? "border-amber-300 bg-amber-50"
//                     : "border-slate-200 bg-slate-50"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold text-slate-800">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-500">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-600">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-500">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-500">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-400">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border-2 border-slate-200 p-4">
//             <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby components                                                           */
// /* -------------------------------------------------------------------------- */

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
//       <div>
//         <p className="text-sm font-semibold text-slate-500">Room Code</p>
//         <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold text-slate-800">Players</h3>
//         <span className="text-sm font-semibold text-slate-500">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold text-slate-800">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs font-semibold text-amber-500">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs font-semibold ${
//                 player.connected ? "text-green-600" : "text-slate-400"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
//       <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-500">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-400">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Game play components                                                       */
// /* -------------------------------------------------------------------------- */

// function ScoreBoard({ room }) {
//   const players = room.players || [];

//   return (
//     <div className={PANEL}>
//       <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//         <h3 className="font-bold text-slate-800">Players</h3>
//         <span className="text-xs font-semibold text-slate-500">
//           {players.length}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
//         {players.map((player) => {
//           const isCurrentDrawer = player.playerId === room.currentDrawer;

//           return (
//             <div
//               key={player.playerId}
//               className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
//                 isCurrentDrawer
//                   ? "border-blue-300 bg-blue-50"
//                   : "border-slate-100 bg-white"
//               }`}
//             >
//               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div className="min-w-0 flex-1">
//                 <p className="truncate text-sm font-semibold text-slate-800">
//                   {player.username}
//                   {isCurrentDrawer && " ✏️"}
//                 </p>
//                 <p className="text-xs font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>

//               <div className="flex shrink-0 flex-col items-end gap-0.5">
//                 {player.isHost && (
//                   <span className="text-xs" title="Room Host">
//                     👑
//                   </span>
//                 )}
//                 <span
//                   className={`h-2 w-2 rounded-full ${
//                     player.connected ? "bg-green-500" : "bg-slate-300"
//                   }`}
//                   title={player.connected ? "Online" : "Reconnecting..."}
//                 />
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, drawerName, wordChoices, onChooseWord }) {
//   return (
//     <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
//       <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

//       <h3 className="mt-3 text-2xl font-bold text-blue-600">
//         {isDrawer
//           ? "Choose a word!"
//           : `${drawerName || "The drawer"} is choosing a word...`}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-6 flex flex-wrap justify-center gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({
//   isDrawer,
//   selectedWord,
//   hintsRevealed,
//   totalHints,
//   hintCount,
//   currentHint,
// }) {
//   if (isDrawer) {
//     return (
//       <div className="text-center">
//         <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//           Your word
//         </p>
//         <p className="text-2xl font-bold text-blue-600">
//           {selectedWord || "Loading..."}
//         </p>
//       </div>
//     );
//   }

//   return (
//     <div className="text-center">
//       <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//         Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
//         {currentHint
//           ? currentHint.trim().split(/\s+/).filter(Boolean).length
//           : "—"}{" "}
//         letters
//       </p>
//       <p className="text-2xl font-bold tracking-widest text-slate-800">
//         {currentHint || "Waiting for hint..."}
//       </p>
//     </div>
//   );
// }

// function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
//   const messagesEndRef = useRef(null);

//   // Keep the newest message in view inside the chat box.
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ block: "nearest" });
//   }, [chatMessages]);

//   return (
//     <div className={PANEL}>
//       <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
//         💬 Guessing Chat
//       </h3>

//       <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
//         {chatMessages.map((msg, index) => {
//           const isCorrect = msg.username?.startsWith("🎉");

//           return (
//             <p
//               key={`${msg.createdAt}-${index}`}
//               className={`break-words rounded-lg px-2 py-1 text-sm ${
//                 isCorrect
//                   ? "bg-green-100 font-semibold text-green-700"
//                   : index % 2 === 0
//                     ? "bg-slate-50 text-slate-700"
//                     : "text-slate-700"
//               }`}
//             >
//               <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
//                 {msg.username}:
//               </span>{" "}
//               {msg.message}
//             </p>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2 border-t-2 border-slate-100 p-3"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
//           />

//           <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;
//   const isGameScreen = GAME_STATUSES.includes(room?.status);

//   /* ----- Screens ----- */

//   const renderLobbyScreen = () => (
//     <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-bold uppercase tracking-widest text-green-600">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold text-slate-800">
//             {getRoomTitle(room)}
//           </h2>

//           <p className="mt-2 text-slate-500">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className={`px-4 py-2 text-sm ${BTN_DANGER}`}
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-500">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}
//       </div>
//     </section>
//   );

//   const renderGameScreen = () => (
//     <section>
//       {/* Top bar: timer, word / hint, round info */}
//       <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
//         <div className="flex items-center gap-3">
//           <div
//             className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
//               isDrawing && timeLeft <= 10
//                 ? "border-rose-500 text-rose-600"
//                 : "border-blue-500 text-blue-600"
//             }`}
//           >
//             {isDrawing ? timeLeft : "⏱️"}
//           </div>

//           <div>
//             <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//               Time Left
//             </p>
//             <p className="text-lg font-bold text-slate-800">
//               {isDrawing ? `${timeLeft}s` : "—"}
//             </p>
//           </div>
//         </div>

//         <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
//           {isDrawing ? (
//             <WordHintBanner
//               isDrawer={isDrawer}
//               selectedWord={selectedWord}
//               hintsRevealed={hintsRevealed}
//               totalHints={totalHints}
//               hintCount={room.hintCount}
//               currentHint={currentHint}
//             />
//           ) : (
//             <p className="text-center text-lg font-bold text-slate-600">
//               {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
//             </p>
//           )}
//         </div>

//         <div className="ml-auto flex items-center gap-3">
//           <div className="text-right">
//             <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
//             <p className="text-xs font-semibold tracking-widest text-slate-400">
//               {room.roomCode}
//             </p>
//           </div>

//           <button
//             onClick={leaveRoom}
//             disabled={loading}
//             className={`px-3 py-2 text-sm ${BTN_DANGER}`}
//           >
//             Leave Room
//           </button>
//         </div>
//       </div>

//       {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
//       <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
//         <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <ScoreBoard room={room} />
//           </div>
//         </div>

//         <div className="order-1 min-w-0 lg:order-none">
//           {room.status === "choosing" && (
//             <WordChoicePanel
//               isDrawer={isDrawer}
//               drawerName={
//                 room.players?.find((p) => p.playerId === room.currentDrawer)?.username
//               }
//               wordChoices={wordChoices}
//               onChooseWord={handleChooseWord}
//             />
//           )}

//           {(isDrawing || room.status === "round-ended") && (
//             <>
//               {room.status === "round-ended" && (
//                 <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
//                   ⏰ Round has ended!
//                 </div>
//               )}

//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </>
//           )}
//         </div>

//         <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </div>
//         </div>
//       </div>
//     </section>
//   );

//   /* ----- Render ----- */

//   return (
//     <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-8 max-w-6xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : isGameScreen ? (
//           renderGameScreen()
//         ) : (
//           renderLobbyScreen()
//         )}
//       </main>
//     </div>
//   );
// }























// import { useEffect, useRef, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// // Room statuses that show the game play area instead of the lobby.
// const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

// /* Shared styles (light, chunky "game" look) */
// const BTN_BASE =
//   "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
// const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
// const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
// const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

// const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
// const PANEL =
//   "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
// const INPUT =
//   "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-6xl items-center justify-between">
//       <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
//         Scribble<span className="text-pink-500">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-500" : "bg-rose-500"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Home screen                                                                */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
//       <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
//         Ready to doodle? ✏️
//       </h2>

//       <p className="mt-3 leading-7 text-slate-500">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-700"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className={`mt-2 ${INPUT}`}
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//         <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className={`min-w-0 flex-1 uppercase ${INPUT}`}
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className={`px-5 py-3 ${BTN_SUCCESS}`}
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
//       >
//         ⚡ Quick Match
//       </button>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Final results screen                                                       */
// /* -------------------------------------------------------------------------- */

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
//           ScribblePlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
//           Game Over!
//         </h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-500">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-600">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-600">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-500">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
//                   isWinner
//                     ? "border-amber-300 bg-amber-50"
//                     : "border-slate-200 bg-slate-50"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold text-slate-800">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-500">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-600">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-500">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-500">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-400">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border-2 border-slate-200 p-4">
//             <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby components                                                           */
// /* -------------------------------------------------------------------------- */

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
//       <div>
//         <p className="text-sm font-semibold text-slate-500">Room Code</p>
//         <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold text-slate-800">Players</h3>
//         <span className="text-sm font-semibold text-slate-500">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold text-slate-800">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs font-semibold text-amber-500">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs font-semibold ${
//                 player.connected ? "text-green-600" : "text-slate-400"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
//       <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-500">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-400">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Game play components                                                       */
// /* -------------------------------------------------------------------------- */

// function ScoreBoard({ room }) {
//   const players = room.players || [];

//   return (
//     <div className={PANEL}>
//       <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//         <h3 className="font-bold text-slate-800">Players</h3>
//         <span className="text-xs font-semibold text-slate-500">
//           {players.length}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
//         {players.map((player) => {
//           const isCurrentDrawer = player.playerId === room.currentDrawer;

//           return (
//             <div
//               key={player.playerId}
//               className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
//                 isCurrentDrawer
//                   ? "border-blue-300 bg-blue-50"
//                   : "border-slate-100 bg-white"
//               }`}
//             >
//               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div className="min-w-0 flex-1">
//                 <p className="truncate text-sm font-semibold text-slate-800">
//                   {player.username}
//                   {isCurrentDrawer && " ✏️"}
//                 </p>
//                 <p className="text-xs font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>

//               <div className="flex shrink-0 flex-col items-end gap-0.5">
//                 {player.isHost && (
//                   <span className="text-xs" title="Room Host">
//                     👑
//                   </span>
//                 )}
//                 <span
//                   className={`h-2 w-2 rounded-full ${
//                     player.connected ? "bg-green-500" : "bg-slate-300"
//                   }`}
//                   title={player.connected ? "Online" : "Reconnecting..."}
//                 />
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, drawerName, wordChoices, onChooseWord }) {
//   return (
//     <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
//       <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

//       <h3 className="mt-3 text-2xl font-bold text-blue-600">
//         {isDrawer
//           ? "Choose a word!"
//           : `${drawerName || "The drawer"} is choosing a word...`}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-6 flex flex-wrap justify-center gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({
//   isDrawer,
//   selectedWord,
//   hintsRevealed,
//   totalHints,
//   hintCount,
//   currentHint,
// }) {
//   if (isDrawer) {
//     return (
//       <div className="text-center">
//         <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//           Your word
//         </p>
//         <p className="text-2xl font-bold text-blue-600">
//           {selectedWord || "Loading..."}
//         </p>
//       </div>
//     );
//   }

//   return (
//     <div className="text-center">
//       <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//         Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
//         {currentHint
//           ? currentHint.trim().split(/\s+/).filter(Boolean).length
//           : "—"}{" "}
//         letters
//       </p>
//       <p className="text-2xl font-bold tracking-widest text-slate-800">
//         {currentHint || "Waiting for hint..."}
//       </p>
//     </div>
//   );
// }

// function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
//   const messagesEndRef = useRef(null);

//   // Keep the newest message in view inside the chat box.
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ block: "nearest" });
//   }, [chatMessages]);

//   return (
//     <div className={PANEL}>
//       <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
//         💬 Guessing Chat
//       </h3>

//       <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
//         {chatMessages.map((msg, index) => {
//           const isCorrect = msg.username?.startsWith("🎉");

//           return (
//             <p
//               key={`${msg.createdAt}-${index}`}
//               className={`break-words rounded-lg px-2 py-1 text-sm ${
//                 isCorrect
//                   ? "bg-green-100 font-semibold text-green-700"
//                   : index % 2 === 0
//                     ? "bg-slate-50 text-slate-700"
//                     : "text-slate-700"
//               }`}
//             >
//               <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
//                 {msg.username}:
//               </span>{" "}
//               {msg.message}
//             </p>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2 border-t-2 border-slate-100 p-3"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
//           />

//           <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;
//   const isGameScreen = GAME_STATUSES.includes(room?.status);

//   /* ----- Screens ----- */

//   const renderLobbyScreen = () => (
//     <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-bold uppercase tracking-widest text-green-600">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold text-slate-800">
//             {getRoomTitle(room)}
//           </h2>

//           <p className="mt-2 text-slate-500">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className={`px-4 py-2 text-sm ${BTN_DANGER}`}
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-500">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}
//       </div>
//     </section>
//   );

//   const renderGameScreen = () => (
//     <section>
//       {/* Top bar: timer, word / hint, round info */}
//       <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
//         <div className="flex items-center gap-3">
//           <div
//             className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
//               isDrawing && timeLeft <= 10
//                 ? "border-rose-500 text-rose-600"
//                 : "border-blue-500 text-blue-600"
//             }`}
//           >
//             {isDrawing ? timeLeft : "⏱️"}
//           </div>

//           <div>
//             <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//               Time Left
//             </p>
//             <p className="text-lg font-bold text-slate-800">
//               {isDrawing ? `${timeLeft}s` : "—"}
//             </p>
//           </div>
//         </div>

//         <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
//           {isDrawing ? (
//             <WordHintBanner
//               isDrawer={isDrawer}
//               selectedWord={selectedWord}
//               hintsRevealed={hintsRevealed}
//               totalHints={totalHints}
//               hintCount={room.hintCount}
//               currentHint={currentHint}
//             />
//           ) : (
//             <p className="text-center text-lg font-bold text-slate-600">
//               {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
//             </p>
//           )}
//         </div>

//         <div className="ml-auto flex items-center gap-3">
//           <div className="text-right">
//             <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
//             <p className="text-xs font-semibold tracking-widest text-slate-400">
//               {room.roomCode}
//             </p>
//           </div>

//           <button
//             onClick={leaveRoom}
//             disabled={loading}
//             className={`px-3 py-2 text-sm ${BTN_DANGER}`}
//           >
//             Leave Room
//           </button>
//         </div>
//       </div>

//       {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
//       <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
//         <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <ScoreBoard room={room} />
//           </div>
//         </div>

//         <div className="order-1 min-w-0 lg:order-none">
//           {room.status === "choosing" && (
//             <WordChoicePanel
//               isDrawer={isDrawer}
//               drawerName={
//                 room.players?.find((p) => p.playerId === room.currentDrawer)?.username
//               }
//               wordChoices={wordChoices}
//               onChooseWord={handleChooseWord}
//             />
//           )}

//           {(isDrawing || room.status === "round-ended") && (
//             <>
//               {room.status === "round-ended" && (
//                 <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
//                   ⏰ Time&apos;s Up! Round has ended.
//                 </div>
//               )}

//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </>
//           )}
//         </div>

//         <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </div>
//         </div>
//       </div>
//     </section>
//   );

//   /* ----- Render ----- */

//   return (
//     <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-8 max-w-6xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : isGameScreen ? (
//           renderGameScreen()
//         ) : (
//           renderLobbyScreen()
//         )}
//       </main>
//     </div>
//   );
// }








































// import { useEffect, useRef, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// // Room statuses that show the game play area instead of the lobby.
// const GAME_STATUSES = ["choosing", "drawing", "round-ended"];

// /* Shared styles (light, chunky "game" look) */
// const BTN_BASE =
//   "rounded-xl font-bold transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
// const BTN_PRIMARY = `${BTN_BASE} bg-blue-500 text-white shadow-[0_4px_0_0_#1d4ed8] hover:bg-blue-400`;
// const BTN_SUCCESS = `${BTN_BASE} bg-green-500 text-white shadow-[0_4px_0_0_#15803d] hover:bg-green-400`;
// const BTN_OUTLINE = `${BTN_BASE} border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// const BTN_DANGER = `${BTN_BASE} border-2 border-rose-300 bg-white text-rose-600 hover:bg-rose-50`;

// const CARD = "rounded-3xl border-4 border-white bg-white/95 shadow-xl";
// const PANEL =
//   "flex h-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white/95 shadow-lg";
// const INPUT =
//   "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20";

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-6xl items-center justify-between">
//       <h1 className="text-3xl font-bold tracking-tight text-blue-600 drop-shadow-sm sm:text-4xl">
//         Scribble<span className="text-pink-500">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border-2 border-white bg-white/90 px-3 py-2 text-sm font-semibold text-slate-700 shadow">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-500" : "bg-rose-500"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-600">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-70"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Home screen                                                                */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className={`mx-auto max-w-xl p-6 sm:p-10 ${CARD}`}>
//       <p className="text-sm font-bold uppercase tracking-[0.2em] text-pink-500">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold text-slate-800 sm:text-4xl">
//         Ready to doodle? ✏️
//       </h2>

//       <p className="mt-3 leading-7 text-slate-500">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-700"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className={`mt-2 ${INPUT}`}
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className={`mt-5 w-full px-4 py-3 ${BTN_PRIMARY}`}
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//         <span className="text-sm font-semibold text-slate-400">OR JOIN A ROOM</span>
//         <div className="h-0.5 flex-1 rounded bg-slate-200" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className={`min-w-0 flex-1 uppercase ${INPUT}`}
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className={`px-5 py-3 ${BTN_SUCCESS}`}
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className={`mt-4 w-full px-4 py-3 ${BTN_OUTLINE}`}
//       >
//         ⚡ Quick Match
//       </button>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Final results screen                                                       */
// /* -------------------------------------------------------------------------- */

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border-4 border-amber-300 bg-white p-6 shadow-xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-500">
//           ScribblePlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-bold text-slate-800 sm:text-5xl">
//           Game Over!
//         </h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-500">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-bold text-amber-500 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-600">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-600">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-500">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold text-slate-800">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 ${
//                   isWinner
//                     ? "border-amber-300 bg-amber-50"
//                     : "border-slate-200 bg-slate-50"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-bold text-slate-400">#{index + 1}</span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold text-slate-800">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-500">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-600">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-500">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className={`w-full px-6 py-3 sm:w-auto ${BTN_PRIMARY}`}
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-500">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className={`w-full px-6 py-3 sm:w-auto ${BTN_SUCCESS}`}
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-400">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border-2 border-slate-200 p-4">
//             <h4 className="mb-3 font-semibold text-slate-700">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm font-semibold text-green-600">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby components                                                           */
// /* -------------------------------------------------------------------------- */

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5">
//       <div>
//         <p className="text-sm font-semibold text-slate-500">Room Code</p>
//         <p className="mt-1 text-3xl font-bold tracking-[0.2em] text-blue-600">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button onClick={onCopy} className={`px-4 py-3 ${BTN_PRIMARY}`}>
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold text-slate-800">Players</h3>
//         <span className="text-sm font-semibold text-slate-500">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-slate-50 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold text-slate-800">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs font-semibold text-amber-500">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs font-semibold ${
//                 player.connected ? "text-green-600" : "text-slate-400"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
//       <h3 className="text-lg font-bold text-slate-800">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-500">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-400">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Game play components                                                       */
// /* -------------------------------------------------------------------------- */

// function ScoreBoard({ room }) {
//   const players = room.players || [];

//   return (
//     <div className={PANEL}>
//       <div className="flex items-center justify-between border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//         <h3 className="font-bold text-slate-800">Players</h3>
//         <span className="text-xs font-semibold text-slate-500">
//           {players.length}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
//         {players.map((player) => {
//           const isCurrentDrawer = player.playerId === room.currentDrawer;

//           return (
//             <div
//               key={player.playerId}
//               className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${
//                 isCurrentDrawer
//                   ? "border-blue-300 bg-blue-50"
//                   : "border-slate-100 bg-white"
//               }`}
//             >
//               <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-bold text-pink-600">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div className="min-w-0 flex-1">
//                 <p className="truncate text-sm font-semibold text-slate-800">
//                   {player.username}
//                   {isCurrentDrawer && " ✏️"}
//                 </p>
//                 <p className="text-xs font-semibold text-green-600">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>

//               <div className="flex shrink-0 flex-col items-end gap-0.5">
//                 {player.isHost && (
//                   <span className="text-xs" title="Room Host">
//                     👑
//                   </span>
//                 )}
//                 <span
//                   className={`h-2 w-2 rounded-full ${
//                     player.connected ? "bg-green-500" : "bg-slate-300"
//                   }`}
//                   title={player.connected ? "Online" : "Reconnecting..."}
//                 />
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, wordChoices, onChooseWord }) {
//   return (
//     <div className="flex min-h-[20rem] w-full flex-col items-center justify-center rounded-2xl border-4 border-white bg-white/95 p-6 text-center shadow-lg">
//       <div className="text-5xl">{isDrawer ? "🎨" : "🤔"}</div>

//       <h3 className="mt-3 text-2xl font-bold text-blue-600">
//         {isDrawer ? "Choose a word!" : "Drawer is choosing a word..."}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-6 flex flex-wrap justify-center gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className={`px-6 py-3 text-lg ${BTN_PRIMARY}`}
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({
//   isDrawer,
//   selectedWord,
//   hintsRevealed,
//   totalHints,
//   hintCount,
//   currentHint,
// }) {
//   if (isDrawer) {
//     return (
//       <div className="text-center">
//         <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//           Your word
//         </p>
//         <p className="text-2xl font-bold text-blue-600">
//           {selectedWord || "Loading..."}
//         </p>
//       </div>
//     );
//   }

//   return (
//     <div className="text-center">
//       <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//         Hint {hintsRevealed}/{totalHints || hintCount || 0} · Word length:{" "}
//         {currentHint
//           ? currentHint.trim().split(/\s+/).filter(Boolean).length
//           : "—"}{" "}
//         letters
//       </p>
//       <p className="text-2xl font-bold tracking-widest text-slate-800">
//         {currentHint || "Waiting for hint..."}
//       </p>
//     </div>
//   );
// }

// function GuessingChat({ chatMessages, chatInput, setChatInput, canGuess, onSubmitGuess }) {
//   const messagesEndRef = useRef(null);

//   // Keep the newest message in view inside the chat box.
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ block: "nearest" });
//   }, [chatMessages]);

//   return (
//     <div className={PANEL}>
//       <h3 className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3 font-bold text-slate-800">
//         💬 Guessing Chat
//       </h3>

//       <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
//         {chatMessages.map((msg, index) => {
//           const isCorrect = msg.username?.startsWith("🎉");

//           return (
//             <p
//               key={`${msg.createdAt}-${index}`}
//               className={`break-words rounded-lg px-2 py-1 text-sm ${
//                 isCorrect
//                   ? "bg-green-100 font-semibold text-green-700"
//                   : index % 2 === 0
//                     ? "bg-slate-50 text-slate-700"
//                     : "text-slate-700"
//               }`}
//             >
//               <span className={`font-bold ${isCorrect ? "" : "text-blue-600"}`}>
//                 {msg.username}:
//               </span>{" "}
//               {msg.message}
//             </p>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2 border-t-2 border-slate-100 p-3"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
//           />

//           <button type="submit" className={`px-4 py-2 text-sm ${BTN_PRIMARY}`}>
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;
//   const isGameScreen = GAME_STATUSES.includes(room?.status);

//   /* ----- Screens ----- */

//   const renderLobbyScreen = () => (
//     <section className={`mx-auto max-w-4xl p-6 sm:p-8 ${CARD}`}>
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-bold uppercase tracking-widest text-green-600">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold text-slate-800">
//             {getRoomTitle(room)}
//           </h2>

//           <p className="mt-2 text-slate-500">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className={`px-4 py-2 text-sm ${BTN_DANGER}`}
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className={`px-8 py-3 text-lg ${BTN_SUCCESS}`}
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-500">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}
//       </div>
//     </section>
//   );

//   const renderGameScreen = () => (
//     <section>
//       {/* Top bar: timer, word / hint, round info */}
//       <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-4 border-white bg-white/95 px-4 py-3 shadow-lg">
//         <div className="flex items-center gap-3">
//           <div
//             className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl font-bold ${
//               isDrawing && timeLeft <= 10
//                 ? "border-rose-500 text-rose-600"
//                 : "border-blue-500 text-blue-600"
//             }`}
//           >
//             {isDrawing ? timeLeft : "⏱️"}
//           </div>

//           <div>
//             <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
//               Time Left
//             </p>
//             <p className="text-lg font-bold text-slate-800">
//               {isDrawing ? `${timeLeft}s` : "—"}
//             </p>
//           </div>
//         </div>

//         <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
//           {isDrawing ? (
//             <WordHintBanner
//               isDrawer={isDrawer}
//               selectedWord={selectedWord}
//               hintsRevealed={hintsRevealed}
//               totalHints={totalHints}
//               hintCount={room.hintCount}
//               currentHint={currentHint}
//             />
//           ) : (
//             <p className="text-center text-lg font-bold text-slate-600">
//               {room.status === "choosing" ? "Get ready to draw & guess!" : "Round over"}
//             </p>
//           )}
//         </div>

//         <div className="ml-auto flex items-center gap-3">
//           <div className="text-right">
//             <p className="font-bold text-slate-800">{getRoomTitle(room)}</p>
//             <p className="text-xs font-semibold tracking-widest text-slate-400">
//               {room.roomCode}
//             </p>
//           </div>

//           <button
//             onClick={leaveRoom}
//             disabled={loading}
//             className={`px-3 py-2 text-sm ${BTN_DANGER}`}
//           >
//             Leave Room
//           </button>
//         </div>
//       </div>

//       {/* Play area: players | drawing board | chat (chat sits to the right of the board) */}
//       <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
//         <div className="order-2 h-64 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <ScoreBoard room={room} />
//           </div>
//         </div>

//         <div className="order-1 min-w-0 lg:order-none">
//           {room.status === "choosing" && (
//             <WordChoicePanel
//               isDrawer={isDrawer}
//               wordChoices={wordChoices}
//               onChooseWord={handleChooseWord}
//             />
//           )}

//           {(isDrawing || room.status === "round-ended") && (
//             <>
//               {room.status === "round-ended" && (
//                 <div className="mb-4 rounded-xl border-2 border-rose-200 bg-rose-100 p-4 text-center font-bold text-rose-700">
//                   ⏰ Time&apos;s Up! Round has ended.
//                 </div>
//               )}

//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </>
//           )}
//         </div>

//         <div className="order-3 h-80 lg:relative lg:order-none lg:h-auto">
//           <div className="h-full lg:absolute lg:inset-0">
//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </div>
//         </div>
//       </div>
//     </section>
//   );

//   /* ----- Render ----- */

//   return (
//     <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-8 max-w-6xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : isGameScreen ? (
//           renderGameScreen()
//         ) : (
//           renderLobbyScreen()
//         )}
//       </main>
//     </div>
//   );
// }




























// import { useEffect, useState } from "react";
// import { useDispatch, useSelector } from "react-redux";
// import useSocket from "./hooks/useSocket.js";
// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
// import DrawingCanvas from "./components/DrawingCanvas.jsx";

// /* -------------------------------------------------------------------------- */
// /* Constants                                                                  */
// /* -------------------------------------------------------------------------- */

// const DEFAULT_TIME_LEFT = 60;

// const MESSAGES = {
//   notConnected: "Not connected to the server.",
//   notConnectedWait: "Not connected to the server. Please wait.",
//   usernameRequired: "Please enter your username first.",
//   requestFailed: "Request failed. Please try again.",
//   startGameFailed: "Could not start the game.",
//   rematchRequestFailed: "Play Again request failed.",
//   rematchStartFailed: "Could not start the rematch.",
//   leaveRoomFailed: "Could not leave the room.",
//   copyFailed: "Could not copy the room code. Please copy it manually.",
//   chooseWordFailed: "Could not select the word.",
//   sendMessageFailed: "Message could not be sent.",
// };

// const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

// const SETTINGS_OPTIONS = {
//   maxPlayers: Array.from({ length: 19 }, (_, i) => i + 2),
//   rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
//   drawTime: [15, 30, 45, 60, 90, 120, 180, 240],
//   wordChoiceCount: [1, 2, 3, 4, 5],
//   hintCount: [0, 1, 2, 3, 4, 5],
// };

// const GUESSING_CANVAS_STYLES = `
//   .guessing-canvas button,
//   .guessing-canvas input,
//   .guessing-canvas label,
//   .guessing-canvas select {
//       display: none !important;
//   }
// `;

// const INITIAL_REMATCH_STATE = { players: [], readyCount: 0 };

// /* -------------------------------------------------------------------------- */
// /* Small presentational components                                            */
// /* -------------------------------------------------------------------------- */

// function Header({ socketConnected }) {
//   return (
//     <header className="mx-auto flex max-w-5xl items-center justify-between">
//       <h1 className="text-2xl font-black tracking-tight text-indigo-400 sm:text-3xl">
//         Scribble<span className="text-white">Play</span>
//       </h1>

//       <div className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-sm">
//         <span
//           className={`h-2.5 w-2.5 rounded-full ${
//             socketConnected ? "bg-green-400" : "bg-red-400"
//           }`}
//         />
//         {socketConnected ? "Connected" : "Connecting..."}
//       </div>
//     </header>
//   );
// }

// function ErrorBanner({ error }) {
//   return (
//     <div
//       role="alert"
//       className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
//     >
//       {error}
//     </div>
//   );
// }

// function SettingSelect({ id, label, value, onChange, disabled, options, formatLabel }) {
//   return (
//     <div>
//       <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-300">
//         {label}
//       </label>
//       <select
//         id={id}
//         value={value}
//         onChange={(e) => onChange(Number(e.target.value))}
//         disabled={disabled}
//         className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//       >
//         {options.map((n) => (
//           <option key={n} value={n}>
//             {formatLabel(n)}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Screens                                                                    */
// /* -------------------------------------------------------------------------- */

// function HomeScreen({
//   username,
//   setUsername,
//   roomCode,
//   setRoomCode,
//   loading,
//   socketConnected,
//   runRoomAction,
// }) {
//   const joinRoom = () =>
//     runRoomAction("room:join", { roomCode: roomCode.trim().toUpperCase() });

//   return (
//     <section className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-10">
//       <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
//         Draw · Guess · Win
//       </p>

//       <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Ready to doodle?</h2>

//       <p className="mt-3 leading-7 text-slate-400">
//         Choose your name and play a drawing and guessing game with your friends.
//       </p>

//       <label
//         htmlFor="username"
//         className="mt-8 block text-sm font-semibold text-slate-200"
//       >
//         Your username
//       </label>

//       <input
//         id="username"
//         value={username}
//         onChange={(e) => setUsername(e.target.value)}
//         onKeyDown={(e) => {
//           if (e.key === "Enter") {
//             runRoomAction("matchmaking:join");
//           }
//         }}
//         maxLength={20}
//         placeholder="Enter your name..."
//         className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
//       />

//       <button
//         onClick={() => runRoomAction("room:create", { type: "private" })}
//         disabled={loading || !socketConnected}
//         className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
//       >
//         {loading ? "Please wait..." : "Create Private Room"}
//       </button>

//       <div className="my-6 flex items-center gap-4">
//         <div className="h-px flex-1 bg-slate-700" />
//         <span className="text-sm text-slate-500">OR JOIN A ROOM</span>
//         <div className="h-px flex-1 bg-slate-700" />
//       </div>

//       <div className="flex gap-3">
//         <input
//           value={roomCode}
//           onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               joinRoom();
//             }
//           }}
//           placeholder="Enter room code"
//           className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 uppercase outline-none focus:border-indigo-500"
//         />

//         <button
//           onClick={joinRoom}
//           disabled={loading || !socketConnected || !roomCode.trim()}
//           className="rounded-xl border border-indigo-500 px-5 py-3 font-bold text-indigo-300 transition hover:bg-indigo-500/10 disabled:opacity-50"
//         >
//           Join
//         </button>
//       </div>

//       <button
//         onClick={() => runRoomAction("matchmaking:join")}
//         disabled={loading || !socketConnected}
//         className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
//       >
//         Quick Match
//       </button>
//     </section>
//   );
// }

// function sortLeaderboard(leaderboard, winnerId) {
//   return [...(leaderboard || [])].sort((a, b) => {
//     const scoreDifference = b.score - a.score;
//     if (scoreDifference !== 0) return scoreDifference;
//     if (a.playerId === winnerId) return -1;
//     if (b.playerId === winnerId) return 1;
//     return 0;
//   });
// }

// function FinalResultsScreen({
//   room,
//   finalResults,
//   rematchState,
//   isHost,
//   socketConnected,
//   onRequestRematch,
//   onStartRematch,
// }) {
//   const winnerId = finalResults.winner?.playerId;

//   return (
//     <section className="mx-auto max-w-2xl rounded-3xl border border-amber-400/30 bg-slate-900 p-6 shadow-2xl sm:p-10">
//       <div className="text-center">
//         <div className="text-6xl">🏆</div>

//         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-400">
//           ScribblePlay Champion
//         </p>

//         <h2 className="mt-3 text-4xl font-black sm:text-5xl">Game Over!</h2>

//         {finalResults.winner ? (
//           <>
//             <p className="mt-6 text-slate-400">Congratulations to</p>

//             <h3 className="mt-2 text-3xl font-black text-amber-400 sm:text-4xl">
//               👑 {finalResults.winner.username}
//             </h3>

//             <p className="mt-3 text-xl font-bold text-green-400">
//               {finalResults.winner.score} points
//             </p>
//           </>
//         ) : (
//           <p className="mt-6 text-slate-300">
//             Game finished, but no winner could be determined.
//           </p>
//         )}

//         <p className="mt-3 text-sm text-slate-400">
//           All {room.maxRounds} rounds completed!
//         </p>
//       </div>

//       <div className="mt-10">
//         <h3 className="text-xl font-bold">🏅 Final Leaderboard</h3>

//         <div className="mt-4 space-y-3">
//           {sortLeaderboard(finalResults.leaderboard, winnerId).map((player, index) => {
//             const isWinner = player.playerId === winnerId;

//             return (
//               <div
//                 key={player.playerId}
//                 className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
//                   isWinner
//                     ? "border-amber-400/50 bg-amber-400/10"
//                     : "border-slate-700 bg-slate-950"
//                 }`}
//               >
//                 <div className="flex min-w-0 items-center gap-3">
//                   <span className="text-lg font-black text-slate-400">
//                     #{index + 1}
//                   </span>

//                   <div className="min-w-0">
//                     <p className="break-words font-semibold">
//                       {player.username}
//                       {isWinner && (
//                         <span className="ml-2 text-amber-400">👑 Winner</span>
//                       )}
//                     </p>
//                   </div>
//                 </div>

//                 <span className="shrink-0 font-bold text-green-400">
//                   {player.score} pts
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       </div>

//       <p className="mt-8 text-center text-sm text-slate-400">
//         Thanks for playing ScribblePlay! 🎨
//       </p>

//       <div className="mt-6 flex flex-col items-center gap-4">
//         <button
//           onClick={onRequestRematch}
//           disabled={!socketConnected}
//           className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-bold hover:bg-indigo-500 disabled:opacity-50 sm:w-auto"
//         >
//           Play Again
//         </button>

//         <p className="text-sm text-slate-400">
//           Players ready: {rematchState.readyCount}
//         </p>

//         {isHost && (
//           <button
//             onClick={onStartRematch}
//             disabled={!socketConnected || rematchState.readyCount < 2}
//             className="w-full rounded-xl bg-green-600 px-6 py-3 font-bold hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
//           >
//             Start Rematch
//           </button>
//         )}

//         <p className="text-center text-xs text-slate-500">
//           At least 2 players must click Play Again. Only ready players will join the
//           next game.
//         </p>

//         {rematchState.players.length > 0 && (
//           <div className="w-full rounded-xl border border-slate-700 p-4">
//             <h4 className="mb-3 font-semibold">Ready for rematch</h4>

//             {rematchState.players.map((player) => (
//               <p key={player.playerId} className="py-1 text-sm text-green-400">
//                 ✓ {player.username}
//                 {player.isHost ? " (Host)" : ""}
//               </p>
//             ))}
//           </div>
//         )}
//       </div>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /* Lobby / game sub-components                                                */
// /* -------------------------------------------------------------------------- */

// function RoomCodeCard({ roomCode, onCopy }) {
//   return (
//     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-5">
//       <div>
//         <p className="text-sm text-slate-400">Room Code</p>
//         <p className="mt-1 text-3xl font-black tracking-[0.2em] text-indigo-300">
//           {roomCode || "N/A"}
//         </p>
//       </div>

//       <button
//         onClick={onCopy}
//         className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"
//       >
//         Copy Code
//       </button>
//     </div>
//   );
// }

// function PlayersList({ room }) {
//   return (
//     <div className="mt-8">
//       <div className="flex items-center justify-between">
//         <h3 className="text-xl font-bold">Players</h3>
//         <span className="text-sm text-slate-400">
//           {room.players?.length || 0}/{room.maxPlayers || 8}
//         </span>
//       </div>

//       <div className="mt-4 grid gap-3 sm:grid-cols-2">
//         {(room.players || []).map((player) => (
//           <div
//             key={player.playerId}
//             className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 p-4"
//           >
//             <div className="flex items-center gap-3">
//               <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-300">
//                 {player.username?.charAt(0).toUpperCase() || "P"}
//               </div>

//               <div>
//                 <p className="font-semibold">{player.username}</p>

//                 {player.isHost && (
//                   <p className="text-xs text-amber-400">Room Host</p>
//                 )}

//                 <p className="text-sm font-semibold text-green-400">
//                   {player.score ?? 0} pts
//                 </p>
//               </div>
//             </div>

//             <span
//               className={`text-xs ${
//                 player.connected ? "text-green-400" : "text-slate-500"
//               }`}
//             >
//               {player.connected ? "Online" : "Reconnecting..."}
//             </span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function GameSettingsPanel({ isHost, disabled, settings }) {
//   const selectDisabled = !isHost || disabled;

//   return (
//     <div className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-5">
//       <h3 className="text-lg font-bold">Game Settings</h3>
//       <p className="mt-1 text-sm text-slate-400">
//         {isHost
//           ? "Choose the settings before starting the game."
//           : "The host has selected these settings for the game."}
//       </p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2">
//         <SettingSelect
//           id="maxPlayers"
//           label="Maximum Players"
//           value={settings.maxPlayers}
//           onChange={settings.setMaxPlayers}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.maxPlayers}
//           formatLabel={(n) => `${n} players`}
//         />

//         <SettingSelect
//           id="rounds"
//           label="Number of Rounds"
//           value={settings.rounds}
//           onChange={settings.setRounds}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.rounds}
//           formatLabel={(n) => `${n} ${pluralize(n, "Round", "Rounds")}`}
//         />

//         <SettingSelect
//           id="drawTime"
//           label="Drawing Time"
//           value={settings.drawTime}
//           onChange={settings.setDrawTime}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.drawTime}
//           formatLabel={(n) => `${n} seconds`}
//         />

//         <SettingSelect
//           id="wordChoiceCount"
//           label="Word Choices per Turn"
//           value={settings.wordChoiceCount}
//           onChange={settings.setWordChoiceCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.wordChoiceCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "choice", "choices")}`}
//         />

//         <SettingSelect
//           id="hintCount"
//           label="Hints per Turn"
//           value={settings.hintCount}
//           onChange={settings.setHintCount}
//           disabled={selectDisabled}
//           options={SETTINGS_OPTIONS.hintCount}
//           formatLabel={(n) => `${n} ${pluralize(n, "hint", "hints")}`}
//         />
//       </div>

//       {!isHost && (
//         <p className="mt-3 text-xs text-slate-500">
//           Only the room host can change the settings.
//         </p>
//       )}
//     </div>
//   );
// }

// function WordChoicePanel({ isDrawer, wordChoices, onChooseWord }) {
//   return (
//     <div className="w-full rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5">
//       <h3 className="text-xl font-bold text-indigo-300">
//         {isDrawer ? "Choose a word!" : "Drawer is choosing a word..."}
//       </h3>

//       {isDrawer && wordChoices.length > 0 && (
//         <div className="mt-4 flex flex-wrap gap-3">
//           {wordChoices.map((word) => (
//             <button
//               key={word}
//               onClick={() => onChooseWord(word)}
//               className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500"
//             >
//               {word}
//             </button>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

// function WordHintBanner({ isDrawer, selectedWord, hintsRevealed, totalHints, hintCount, currentHint }) {
//   return (
//     <div className="mb-4 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-center">
//       {isDrawer ? (
//         <p className="text-lg font-semibold text-indigo-200">
//           Your word:{" "}
//           <span className="text-2xl font-black text-white">
//             {selectedWord || "Loading..."}
//           </span>
//         </p>
//       ) : (
//         <div>
//           <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
//             Hint {hintsRevealed}/{totalHints || hintCount || 0}
//           </p>
//           <p className="mt-1 text-xs font-medium text-indigo-200">
//             Word length:{" "}
//             {currentHint
//               ? currentHint.trim().split(/\s+/).filter(Boolean).length
//               : "—"}{" "}
//             letters
//           </p>
//           <p className="mt-1 text-2xl font-black tracking-widest text-white">
//             {currentHint || "Waiting for hint..."}
//           </p>
//         </div>
//       )}
//     </div>
//   );
// }

// function GuessingChat({
//   chatMessages,
//   chatInput,
//   setChatInput,
//   canGuess,
//   onSubmitGuess,
// }) {
//   return (
//     <div className="mt-6 w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
//       <h3 className="mb-3 text-lg font-bold text-gray-800">💬 Guessing Chat</h3>

//       <div className="mb-4 flex h-64 flex-col gap-2 overflow-y-auto rounded-lg bg-gray-50 p-3">
//         {chatMessages.map((msg, index) => (
//           <p
//             key={`${msg.createdAt}-${index}`}
//             className="break-words text-sm text-gray-800"
//           >
//             <span className="font-semibold text-indigo-600">{msg.username}:</span>{" "}
//             {msg.message}
//           </p>
//         ))}
//       </div>

//       {canGuess && (
//         <form
//           onSubmit={(e) => {
//             e.preventDefault();
//             onSubmitGuess();
//           }}
//           className="flex gap-2"
//         >
//           <input
//             type="text"
//             value={chatInput}
//             onChange={(e) => setChatInput(e.target.value)}
//             maxLength={100}
//             placeholder="Guess the word..."
//             className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-black outline-none focus:border-indigo-500"
//           />

//           <button
//             type="submit"
//             className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
//           >
//             Send
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// function getRoomTitle(room) {
//   if (room.status === "waiting") return "Waiting Lobby";
//   if (room.status === "finished") return "Game Finished";
//   return `Round ${room.round} of ${room.maxRounds}`;
// }

// /* -------------------------------------------------------------------------- */
// /* Main component                                                             */
// /* -------------------------------------------------------------------------- */

// export default function App() {
//   const socket = useSocket();
//   const dispatch = useDispatch();

//   const { socketConnected, room, error } = useSelector((state) => state.game);

//   const playerId = sessionStorage.getItem("scribblePlayerId");

//   const isHost = room?.players?.some(
//     (player) => player.playerId === playerId && player.isHost
//   );

//   const isDrawer = room?.currentDrawer === playerId;

//   /* ----- Local state ----- */

//   const [username, setUsername] = useState(
//     () => sessionStorage.getItem("scribbleUsername") || ""
//   );
//   const [roomCode, setRoomCode] = useState("");
//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);
//   const [selectedWord, setSelectedWord] = useState("");
//   const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LEFT);

//   const [chatMessages, setChatMessages] = useState([]);
//   const [chatInput, setChatInput] = useState("");

//   const [finalResults, setFinalResults] = useState(null);
//   const [rematchState, setRematchState] = useState(INITIAL_REMATCH_STATE);

//   const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);

//   const [currentHint, setCurrentHint] = useState("");
//   const [hintsRevealed, setHintsRevealed] = useState(0);
//   const [totalHints, setTotalHints] = useState(0);

//   /* ----- Socket event listeners ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const handleWordChoices = (choices) => {
//       setWordChoices(Array.isArray(choices) ? choices : []);
//       setSelectedWord("");
//     };

//     const handleWordSelected = (data) => {
//       setSelectedWord(data.word);
//       setWordChoices([]);
//     };

//     const handleGameHint = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(data?.hintsRevealed || 0);
//       setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleHintReset = (data) => {
//       setCurrentHint(data?.hint || "");
//       setHintsRevealed(0);
//       setTotalHints(data?.hintCount ?? 0);
//       setSelectedWord("");
//     };

//     const handleChatMessage = (message) => {
//       setChatMessages((prev) => [...prev, message]);
//     };

//     const handleCorrectGuess = (data) => {
//       setChatMessages((prev) => [
//         ...prev,
//         {
//           playerId: data.playerId,
//           username: "🎉 " + data.username,
//           message: `guessed correctly! +${data.points} points`,
//           createdAt: Date.now(),
//         },
//       ]);
//     };

//     const handleGameFinished = (data) => {
//       setFinalResults(data);
//     };

//     const handleRematchState = (data) => {
//       setRematchState({
//         players: data.players || [],
//         readyCount: data.readyCount || 0,
//       });
//     };

//     const handleRematchStarted = () => {
//       setFinalResults(null);
//       setRematchState({ players: [], readyCount: 0 });
//       setWordChoices([]);
//       setSelectedWord("");
//       setChatMessages([]);
//       setChatInput("");
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     const handleRoomClosed = () => {
//       dispatch(clearRoom());
//       setFinalResults(null);
//       setRematchState({ readyCount: 0, players: [] });
//       setWordChoices([]);
//       setChatMessages([]);
//       setTimeLeft(DEFAULT_TIME_LEFT);
//     };

//     socket.on("chat:message", handleChatMessage);
//     socket.on("game:word-choices", handleWordChoices);
//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     socket.on("game:hint-reset", handleHintReset);
//     socket.on("game:correct-guess", handleCorrectGuess);
//     socket.on("game:finished", handleGameFinished);
//     socket.on("rematch:state", handleRematchState);
//     socket.on("rematch:started", handleRematchStarted);
//     socket.on("room:closed", handleRoomClosed);

//     return () => {
//       socket.off("game:word-choices", handleWordChoices);
//       socket.off("game:word-selected", handleWordSelected);
//       socket.off("game:hint", handleGameHint);
//       socket.off("game:hint-reset", handleHintReset);
//       socket.off("chat:message", handleChatMessage);
//       socket.off("game:correct-guess", handleCorrectGuess);
//       socket.off("game:finished", handleGameFinished);
//       socket.off("rematch:state", handleRematchState);
//       socket.off("rematch:started", handleRematchStarted);
//       socket.off("room:closed", handleRoomClosed);
//     };
//   }, [socket]);

//   /* ----- Turn timer ----- */

//   useEffect(() => {
//     if (room?.status !== "drawing" || !room?.turnEndsAt) {
//       setTimeLeft(DEFAULT_TIME_LEFT);
//       return;
//     }

//     const updateTimer = () => {
//       const remaining = Math.max(
//         0,
//         Math.ceil((room.turnEndsAt - Date.now()) / 1000)
//       );
//       setTimeLeft(remaining);
//     };

//     updateTimer();

//     const intervalId = setInterval(updateTimer, 250);

//     return () => clearInterval(intervalId);
//   }, [room?.status, room?.turnEndsAt]);

//   /* ----- Action handlers ----- */

//   // Emits an event that only needs an error message when it fails.
//   const emitSimpleAction = (eventName, fallbackMessage, payload) => {
//     const handleResponse = (response) => {
//       if (!response?.success) {
//         dispatch(setError(response?.message || fallbackMessage));
//       }
//     };

//     if (payload === undefined) {
//       socket.emit(eventName, handleResponse);
//     } else {
//       socket.emit(eventName, payload, handleResponse);
//     }
//   };

//   const handleStartGame = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     dispatch(setError(""));

//     emitSimpleAction("game:start", MESSAGES.startGameFailed, {
//       rounds: selectedRounds,
//       maxPlayers: selectedMaxPlayers,
//       drawTime: selectedDrawTime,
//       wordChoiceCount: selectedWordChoiceCount,
//       hintCount: selectedHintCount,
//     });
//   };

//   const handleRequestRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:request", MESSAGES.rematchRequestFailed);
//   };

//   const handleStartRematch = () => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnected));
//       return;
//     }

//     emitSimpleAction("rematch:start", MESSAGES.rematchStartFailed);
//   };

//   const handleChooseWord = (word) => {
//     emitSimpleAction("game:choose-word", MESSAGES.chooseWordFailed, { word });
//   };

//   const handleSubmitGuess = () => {
//     const message = chatInput.trim();

//     if (!message || !socket) return;

//     emitSimpleAction("chat:guess", MESSAGES.sendMessageFailed, { message });

//     setChatInput("");
//   };

//   const runRoomAction = (eventName, payload = {}) => {
//     if (!socket?.connected) {
//       dispatch(setError(MESSAGES.notConnectedWait));
//       return;
//     }

//     if (!username.trim()) {
//       dispatch(setError(MESSAGES.usernameRequired));
//       return;
//     }

//     setLoading(true);
//     dispatch(setError(""));

//     socket.emit(
//       eventName,
//       { ...payload, username: username.trim() },
//       (response) => {
//         setLoading(false);

//         if (!response?.success) {
//           dispatch(setError(response?.message || MESSAGES.requestFailed));
//           return;
//         }

//         sessionStorage.setItem("scribbleUsername", username.trim());

//         if (response.data) {
//           dispatch(setRoom(response.data));
//         }
//       }
//     );
//   };

//   const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || MESSAGES.leaveRoomFailed));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState(INITIAL_REMATCH_STATE);
//     setTimeLeft(DEFAULT_TIME_LEFT);
//   };

//   const copyRoomCode = async () => {
//     if (!room?.roomCode) return;

//     try {
//       await navigator.clipboard.writeText(room.roomCode);
//       dispatch(setError(""));
//     } catch {
//       dispatch(setError(MESSAGES.copyFailed));
//     }
//   };

//   /* ----- Derived values ----- */

//   const settings = {
//     maxPlayers: selectedMaxPlayers,
//     setMaxPlayers: setSelectedMaxPlayers,
//     rounds: selectedRounds,
//     setRounds: setSelectedRounds,
//     drawTime: selectedDrawTime,
//     setDrawTime: setSelectedDrawTime,
//     wordChoiceCount: selectedWordChoiceCount,
//     setWordChoiceCount: setSelectedWordChoiceCount,
//     hintCount: selectedHintCount,
//     setHintCount: setSelectedHintCount,
//   };

//   const isDrawing = room?.status === "drawing";
//   const canDraw = isDrawer && isDrawing;

//   /* ----- Render ----- */

//   const renderRoomScreen = () => (
//     <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
//       <div className="flex flex-wrap items-start justify-between gap-4">
//         <div>
//           <p className="text-sm font-semibold uppercase tracking-widest text-green-400">
//             Room created
//           </p>

//           <h2 className="mt-2 text-3xl font-bold">{getRoomTitle(room)}</h2>

//           <p className="mt-2 text-slate-400">
//             {room.status === "waiting"
//               ? "Share the room code with your friends."
//               : "Draw · Guess · Win"}
//           </p>
//         </div>

//         <button
//           onClick={leaveRoom}
//           disabled={loading}
//           className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
//         >
//           Leave Room
//         </button>
//       </div>

//       <RoomCodeCard roomCode={room.roomCode} onCopy={copyRoomCode} />

//       <PlayersList room={room} />

//       <div className="mt-8 flex flex-col items-center gap-4">
//         {room.status === "waiting" && (
//           <GameSettingsPanel
//             isHost={isHost}
//             disabled={loading || !socketConnected}
//             settings={settings}
//           />
//         )}

//         {room.status === "waiting" && isHost && (
//           <button
//             onClick={handleStartGame}
//             disabled={
//               loading ||
//               !socketConnected ||
//               room.players?.filter((p) => p.connected).length < 2
//             }
//             className="rounded-xl bg-green-600 px-8 py-3 font-bold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
//           >
//             Start Game
//           </button>
//         )}

//         {room.status === "waiting" && (
//           <p className="text-center text-sm text-slate-400">
//             The host can start the game. At least 2 players are required.
//           </p>
//         )}

//         {room.status === "choosing" && (
//           <WordChoicePanel
//             isDrawer={isDrawer}
//             wordChoices={wordChoices}
//             onChooseWord={handleChooseWord}
//           />
//         )}

//         {(isDrawing || room.status === "round-ended") && (
//           <>
//             {room.status === "round-ended" && (
//               <div className="mb-4 rounded-xl bg-red-100 p-4 text-center font-bold text-red-700">
//                 ⏰ Time&apos;s Up! Round has ended.
//               </div>
//             )}

//             {isDrawing && (
//               <div className="mb-4 text-center text-2xl font-bold">
//                 ⏱️ Time Left: {timeLeft}s
//               </div>
//             )}

//             {isDrawing && (
//               <WordHintBanner
//                 isDrawer={isDrawer}
//                 selectedWord={selectedWord}
//                 hintsRevealed={hintsRevealed}
//                 totalHints={totalHints}
//                 hintCount={room.hintCount}
//                 currentHint={currentHint}
//               />
//             )}

//             <style>{GUESSING_CANVAS_STYLES}</style>
//             <div
//               className={
//                 canDraw
//                   ? "drawing-canvas-area"
//                   : "drawing-canvas-area guessing-canvas"
//               }
//             >
//               <DrawingCanvas socket={socket} isDrawer={canDraw} />
//             </div>

//             <GuessingChat
//               chatMessages={chatMessages}
//               chatInput={chatInput}
//               setChatInput={setChatInput}
//               canGuess={!isDrawer && isDrawing}
//               onSubmitGuess={handleSubmitGuess}
//             />
//           </>
//         )}
//       </div>
//     </section>
//   );

//   return (
//     <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
//       <Header socketConnected={socketConnected} />

//       <main className="mx-auto mt-12 max-w-5xl">
//         {error && <ErrorBanner error={error} />}

//         {!room ? (
//           <HomeScreen
//             username={username}
//             setUsername={setUsername}
//             roomCode={roomCode}
//             setRoomCode={setRoomCode}
//             loading={loading}
//             socketConnected={socketConnected}
//             runRoomAction={runRoomAction}
//           />
//         ) : finalResults ? (
//           <FinalResultsScreen
//             room={room}
//             finalResults={finalResults}
//             rematchState={rematchState}
//             isHost={isHost}
//             socketConnected={socketConnected}
//             onRequestRematch={handleRequestRematch}
//             onStartRematch={handleStartRematch}
//           />
//         ) : (
//           renderRoomScreen()
//         )}
//       </main>
//     </div>
//   );
// }



























































// import { useEffect, useState } from "react";

// import { useDispatch, useSelector } from "react-redux";

// import useSocket from "./hooks/useSocket.js";

// import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";

// import DrawingCanvas from "./components/DrawingCanvas.jsx";



// export default function App() {

//   const socket = useSocket();

//   const dispatch = useDispatch();





//   const { socketConnected, room, error } = useSelector(

//     (state) => state.game

//   );



//   const playerId = sessionStorage.getItem("scribblePlayerId");



// const isHost = room?.players?.some(

//     (player) => player.playerId === playerId && player.isHost

// );



// const isDrawer = room?.currentDrawer === playerId;



//   const [username, setUsername] = useState(

//     () => sessionStorage.getItem("scribbleUsername") || ""

//   );

//   const [roomCode, setRoomCode] = useState("");

//   const [loading, setLoading] = useState(false);

//   const [wordChoices, setWordChoices] = useState([]);

// const [selectedWord, setSelectedWord] = useState("");

// const [timeLeft, setTimeLeft] = useState(60);

// const [chatMessages, setChatMessages] = useState([]);

// const [chatInput, setChatInput] = useState("");

// const [finalResults, setFinalResults] = useState(null);

// const [rematchState, setRematchState] = useState({

//     players: [],

//     readyCount: 0,

// });

// const [selectedRounds, setSelectedRounds] = useState(3);
//   const [selectedMaxPlayers, setSelectedMaxPlayers] = useState(8);
//   const [selectedDrawTime, setSelectedDrawTime] = useState(60);
//   const [selectedWordChoiceCount, setSelectedWordChoiceCount] = useState(3);
//   const [selectedHintCount, setSelectedHintCount] = useState(0);
// const [currentHint, setCurrentHint] = useState("");
// const [hintsRevealed, setHintsRevealed] = useState(0);
// const [totalHints, setTotalHints] = useState(0);






// useEffect(() => {

//     if (!socket) return;



//     const handleWordChoices = (choices) => {

//         setWordChoices(Array.isArray(choices) ? choices : []);

//         setSelectedWord("");

//     };



//     const handleWordSelected = (data) => {

//         setSelectedWord(data.word);

//         setWordChoices([]);

//     };

//     const handleGameHint = (data) => {
//         setCurrentHint(data?.hint || "");
//         setHintsRevealed(data?.hintsRevealed || 0);
//         setTotalHints(data?.hintCount ?? 0);
//         setTotalHints(data?.hintCount ?? 0);
//     };

//     const handleChatMessage = (message) => {

//     setChatMessages((prev) => [...prev, message]);

// };



// socket.on("chat:message", handleChatMessage);



//     socket.on("game:word-choices", handleWordChoices);

//     socket.on("game:word-selected", handleWordSelected);
//     socket.on("game:hint", handleGameHint);
//     const handleHintReset = (data) => { setCurrentHint(data?.hint || ""); setHintsRevealed(0); setTotalHints(data?.hintCount ?? 0); setSelectedWord(""); };
//     socket.on("game:hint-reset", handleHintReset);



// const handleCorrectGuess = (data) => {

//     setChatMessages((prev) => [

//         ...prev,

//         {

//             playerId: data.playerId,

//             username: "🎉 " + data.username,

//             message: `guessed correctly! +${data.points} points`,

//             createdAt: Date.now(),

//         },

//     ]);

// };





// socket.on("game:correct-guess", handleCorrectGuess);



// const handleGameFinished = (data) => {

//     setFinalResults(data);

// };



// socket.on("game:finished", handleGameFinished);



// const handleRematchState = (data) => {

//     setRematchState({

//         players: data.players || [],

//         readyCount: data.readyCount || 0,

//     });

// };



// const handleRematchStarted = () => {

//     setFinalResults(null);

//     setRematchState({ players: [], readyCount: 0 });

//     setWordChoices([]);

//     setSelectedWord("");

//     setChatMessages([]);

//     setChatInput("");

//     setTimeLeft(60);

// };



// socket.on("rematch:state", handleRematchState);

// socket.on("rematch:started", handleRematchStarted);



// const handleRoomClosed = () => {

//     dispatch(clearRoom());

//     setFinalResults(null);

//     setRematchState({

//         readyCount: 0,

//         players: [],

//     });

//     setWordChoices([]);

//     setChatMessages([]);

//     setTimeLeft(60);

// };



// socket.on("room:closed", handleRoomClosed);



//     return () => {

//         socket.off("game:word-choices", handleWordChoices);

//         socket.off("game:word-selected", handleWordSelected);
//         socket.off("game:hint", handleGameHint);
//         socket.off("game:hint-reset", handleHintReset);

//         socket.off("chat:message", handleChatMessage);

//         socket.off("game:correct-guess", handleCorrectGuess);

//         socket.off("game:finished", handleGameFinished);

//         socket.off("rematch:state", handleRematchState);

//         socket.off("rematch:started", handleRematchStarted);

//         socket.off("room:closed", handleRoomClosed);

//     };

// }, [socket]);



// const handleStartGame = () => {

//     if (!socket?.connected) {

//         dispatch(setError("Server se connection nahi hai."));

//         return;

//     }



//     dispatch(setError(""));



//     socket.emit(

//         "game:start",

//         {
//           rounds: selectedRounds,
//           maxPlayers: selectedMaxPlayers,
//           drawTime: selectedDrawTime,
//           wordChoiceCount: selectedWordChoiceCount,
//           hintCount: selectedHintCount,
//         },

//         (response) => {

//             if (!response?.success) {

//                 dispatch(

//                     setError(

//                         response?.message || "Game start nahi ho paya."

//                     )

//                 );

//             }

//         }

//     );

// };



// const handleRequestRematch = () => {

//     if (!socket?.connected) {

//         dispatch(setError("Server se connection nahi hai."));

//         return;

//     }



//     socket.emit("rematch:request", (response) => {

//         if (!response?.success) {

//             dispatch(

//                 setError(response?.message || "Play Again request failed.")

//             );

//         }

//     });

// };



// const handleStartRematch = () => {

//     if (!socket?.connected) {

//         dispatch(setError("Server se connection nahi hai."));

//         return;

//     }



//     socket.emit("rematch:start", (response) => {

//         if (!response?.success) {

//             dispatch(

//                 setError(response?.message || "Rematch start nahi ho paya.")

//             );

//         }

//     });

// };







//   const runRoomAction = (eventName, payload = {}) => {

//     if (!socket?.connected) {

//       dispatch(setError("Server se connection nahi hai. Please wait."));

//       return;

//     }



//     if (!username.trim()) {

//       dispatch(setError("Pehle apna username enter karo."));

//       return;

//     }



//     setLoading(true);

//     dispatch(setError(""));



//     socket.emit(

//       eventName,

//       { ...payload, username: username.trim() },

//       (response) => {

//         setLoading(false);



//         if (!response?.success) {

//           dispatch(

//             setError(response?.message || "Request failed. Please try again.")

//           );

//           return;

//         }



//         sessionStorage.setItem("scribbleUsername", username.trim());



//         if (response.data) {

//           dispatch(setRoom(response.data));

//         }

//       }

//     );

//   };





// const leaveRoom = () => {
//     // Always release the loading state when returning to the home screen.
//     setLoading(false);
//     dispatch(setError(""));

//     if (socket?.connected) {
//       socket.emit("room:leave", {}, (response) => {
//         if (response && response.success === false) {
//           dispatch(setError(response.message || "Room leave nahi ho paya."));
//         }
//         setLoading(false);
//       });
//     }

//     dispatch(clearRoom());
//     setWordChoices([]);
//     setSelectedWord("");
//     setCurrentHint("");
//     setHintsRevealed(0);
//     setTotalHints(0);
//     setChatMessages([]);
//     setChatInput("");
//     setFinalResults(null);
//     setRematchState({ players: [], readyCount: 0 });
//     setTimeLeft(60);
// };





//   const copyRoomCode = async () => {

//     if (!room?.roomCode) return;



//     try {

//       await navigator.clipboard.writeText(room.roomCode);

//       dispatch(setError(""));

//     } catch {

//       dispatch(setError("Room code copy nahi hua. Use manually copy karo."));

//     }

//   };





//   useEffect(() => {

//     if (room?.status !== "drawing" || !room?.turnEndsAt) {

//         setTimeLeft(60);

//         return;

//     }



//     const updateTimer = () => {

//         const remaining = Math.max(

//             0,

//             Math.ceil((room.turnEndsAt - Date.now()) / 1000)

//         );



//         setTimeLeft(remaining);

//     };



//     updateTimer();



//     const intervalId = setInterval(updateTimer, 250);



//     return () => clearInterval(intervalId);

// }, [room?.status, room?.turnEndsAt]);





// return (

//     <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">

//         <header className="mx-auto flex max-w-5xl items-center justify-between">

//             <h1 className="text-2xl font-black tracking-tight text-indigo-400 sm:text-3xl">

//                 Scribble<span className="text-white">Play</span>

//             </h1>



//             <div className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-2 text-sm">

//                 <span

//                     className={`h-2.5 w-2.5 rounded-full ${

//                         socketConnected ? "bg-green-400" : "bg-red-400"

//                     }`}

//                 />

//                 {socketConnected ? "Connected" : "Connecting..."}

//             </div>

//         </header>



//         <main className="mx-auto mt-12 max-w-5xl">

//             {error && (

//                 <div

//                     role="alert"

//                     className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"

//                 >

//                     {error}

//                 </div>

//             )}



//             {!room ? (

//                 <section className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-10">

//                     <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">

//                         Draw · Guess · Win

//                     </p>



//                     <h2 className="mt-3 text-3xl font-bold sm:text-4xl">

//                         Ready to doodle?

//                     </h2>



//                     <p className="mt-3 leading-7 text-slate-400">

//                         Apna naam choose karo aur friends ke saath drawing aur guessing game khelo.

//                     </p>



//                     <label

//                         htmlFor="username"

//                         className="mt-8 block text-sm font-semibold text-slate-200"

//                     >

//                         Your username

//                     </label>



//                     <input

//                         id="username"

//                         value={username}

//                         onChange={(e) => setUsername(e.target.value)}

//                         onKeyDown={(e) => {

//                             if (e.key === "Enter") {

//                                 runRoomAction("matchmaking:join");

//                             }

//                         }}

//                         maxLength={20}

//                         placeholder="Enter your name..."

//                         className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"

//                     />



//                     <button

//                         onClick={() => runRoomAction("room:create", { type: "private" })}

//                         disabled={loading || !socketConnected}

//                         className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"

//                     >

//                         {loading ? "Please wait..." : "Create Private Room"}

//                     </button>



//                     <div className="my-6 flex items-center gap-4">

//                         <div className="h-px flex-1 bg-slate-700" />

//                         <span className="text-sm text-slate-500">OR JOIN A ROOM</span>

//                         <div className="h-px flex-1 bg-slate-700" />

//                     </div>



//                     <div className="flex gap-3">

//                         <input

//                             value={roomCode}

//                             onChange={(e) => setRoomCode(e.target.value.toUpperCase())}

//                             onKeyDown={(e) => {

//                                 if (e.key === "Enter") {

//                                     runRoomAction("room:join", {

//                                         roomCode: roomCode.trim().toUpperCase(),

//                                     });

//                                 }

//                             }}

//                             placeholder="Enter room code"

//                             className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 uppercase outline-none focus:border-indigo-500"

//                         />



//                         <button

//                             onClick={() =>

//                                 runRoomAction("room:join", {

//                                     roomCode: roomCode.trim().toUpperCase(),

//                                 })

//                             }

//                             disabled={loading || !socketConnected || !roomCode.trim()}

//                             className="rounded-xl border border-indigo-500 px-5 py-3 font-bold text-indigo-300 transition hover:bg-indigo-500/10 disabled:opacity-50"

//                         >

//                             Join

//                         </button>

//                     </div>



//                     <button

//                         onClick={() => runRoomAction("matchmaking:join")}

//                         disabled={loading || !socketConnected}

//                         className="mt-4 w-full rounded-xl border border-slate-700 px-4 py-3 font-semibold transition hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"

//                     >

//                         Quick Match

//                     </button>

//                 </section>

//             ) : finalResults ? (

//                 // FINAL WINNER SCREEN

//                 <section className="mx-auto max-w-2xl rounded-3xl border border-amber-400/30 bg-slate-900 p-6 shadow-2xl sm:p-10">

//                     <div className="text-center">

//                         <div className="text-6xl">🏆</div>



//                         <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-amber-400">

//                             ScribblePlay Champion

//                         </p>



//                         <h2 className="mt-3 text-4xl font-black sm:text-5xl">

//                             Game Over!

//                         </h2>



//                         {finalResults.winner ? (

//                             <>

//                                 <p className="mt-6 text-slate-400">

//                                     Congratulations to

//                                 </p>



//                                 <h3 className="mt-2 text-3xl font-black text-amber-400 sm:text-4xl">

//                                     👑 {finalResults.winner.username}

//                                 </h3>



//                                 <p className="mt-3 text-xl font-bold text-green-400">

//                                     {finalResults.winner.score} points

//                                 </p>

//                             </>

//                         ) : (

//                             <p className="mt-6 text-slate-300">

//                                 Game finished, but no winner could be determined.

//                             </p>

//                         )}



//                         <p className="mt-3 text-sm text-slate-400">

//                            All {room.maxRounds} rounds completed!

//                         </p>

//                     </div>



//                     <div className="mt-10">

//                         <h3 className="text-xl font-bold">

//                             🏅 Final Leaderboard

//                         </h3>



//                         <div className="mt-4 space-y-3">

//                             {[...(finalResults.leaderboard || [])]

//                                 .sort((a, b) => {

//                                     const scoreDifference = b.score - a.score;



//                                     if (scoreDifference !== 0) {

//                                         return scoreDifference;

//                                     }



//                                     if (a.playerId === finalResults.winner?.playerId) {

//                                         return -1;

//                                     }



//                                     if (b.playerId === finalResults.winner?.playerId) {

//                                         return 1;

//                                     }



//                                     return 0;

//                                 })

//                                 .map((player, index) => {

//                                     const isWinner =

//                                         player.playerId === finalResults.winner?.playerId;



//                                     return (

//                                         <div

//                                             key={player.playerId}

//                                             className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${

//                                                 isWinner

//                                                     ? "border-amber-400/50 bg-amber-400/10"

//                                                     : "border-slate-700 bg-slate-950"

//                                             }`}

//                                         >

//                                             <div className="flex min-w-0 items-center gap-3">

//                                                 <span className="text-lg font-black text-slate-400">

//                                                     #{index + 1}

//                                                 </span>



//                                                 <div className="min-w-0">

//                                                     <p className="break-words font-semibold">

//                                                         {player.username}

//                                                         {isWinner && (

//                                                             <span className="ml-2 text-amber-400">

//                                                                 👑 Winner

//                                                             </span>

//                                                         )}

//                                                     </p>

//                                                 </div>

//                                             </div>



//                                             <span className="shrink-0 font-bold text-green-400">

//                                                 {player.score} pts

//                                             </span>

//                                         </div>

//                                     );

//                                 })}

//                         </div>

//                     </div>



//                     <p className="mt-8 text-center text-sm text-slate-400">

//                         Thanks for playing ScribblePlay! 🎨

//                     </p>



//                     <div className="mt-6 flex flex-col items-center gap-4">

//     <button

//         onClick={handleRequestRematch}

//         disabled={!socketConnected}

//         className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-bold hover:bg-indigo-500 disabled:opacity-50 sm:w-auto"

//     >

//         Play Again

//     </button>



//     <p className="text-sm text-slate-400">

//         Players ready: {rematchState.readyCount}

//     </p>



//     {isHost && (

//         <button

//             onClick={handleStartRematch}

//             disabled={!socketConnected || rematchState.readyCount < 2}

//             className="w-full rounded-xl bg-green-600 px-6 py-3 font-bold hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"

//         >

//             Start Rematch

//         </button>

//     )}



//     <p className="text-center text-xs text-slate-500">

//         At least 2 players must click Play Again. Only ready players will join the next game.

//     </p>



//     {rematchState.players.length > 0 && (

//         <div className="w-full rounded-xl border border-slate-700 p-4">

//             <h4 className="mb-3 font-semibold">Ready for rematch</h4>



//             {rematchState.players.map((player) => (

//                 <p key={player.playerId} className="py-1 text-sm text-green-400">

//                     ✓ {player.username}

//                     {player.isHost ? " (Host)" : ""}

//                 </p>

//             ))}

//         </div>

//     )}

// </div>

//                 </section>

//             ) : (

//                 // EXISTING LOBBY AND GAME SCREEN

//                 <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">

//                     <div className="flex flex-wrap items-start justify-between gap-4">

//                         <div>

//                             <p className="text-sm font-semibold uppercase tracking-widest text-green-400">

//                                 Room created

//                             </p>





// <h2 className="mt-2 text-3xl font-bold">

//     {room.status === "waiting"

//         ? "Waiting Lobby"

//         : room.status === "finished"

//           ? "Game Finished"

//           : `Round ${room.round} of ${room.maxRounds}`}

// </h2>





//                             <p className="mt-2 text-slate-400">

//                                 {room.status === "waiting"

//                                     ? "Friends ko room code share karo."

//                                     : "Draw · Guess · Win"}

//                             </p>

//                         </div>



//                         <button

//                             onClick={leaveRoom}

//                             disabled={loading}

//                             className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"

//                         >

//                             Leave Room

//                         </button>

//                     </div>



//                     <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-5">

//                         <div>

//                             <p className="text-sm text-slate-400">Room Code</p>

//                             <p className="mt-1 text-3xl font-black tracking-[0.2em] text-indigo-300">

//                                 {room.roomCode || "N/A"}

//                             </p>

//                         </div>



//                         <button

//                             onClick={copyRoomCode}

//                             className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500"

//                         >

//                             Copy Code

//                         </button>

//                     </div>



//                     <div className="mt-8">

//                         <div className="flex items-center justify-between">

//                             <h3 className="text-xl font-bold">Players</h3>

//                             <span className="text-sm text-slate-400">

//                                 {room.players?.length || 0}/{room.maxPlayers || 8}

//                             </span>

//                         </div>



//                         <div className="mt-4 grid gap-3 sm:grid-cols-2">

//                             {(room.players || []).map((player) => (

//                                 <div

//                                     key={player.playerId}

//                                     className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 p-4"

//                                 >

//                                     <div className="flex items-center gap-3">

//                                         <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-300">

//                                             {player.username?.charAt(0).toUpperCase() || "P"}

//                                         </div>



//                                         <div>

//                                             <p className="font-semibold">{player.username}</p>



//                                             {player.isHost && (

//                                                 <p className="text-xs text-amber-400">

//                                                     Room Host

//                                                 </p>

//                                             )}



//                                             <p className="text-sm font-semibold text-green-400">

//                                                 {player.score ?? 0} pts

//                                             </p>

//                                         </div>

//                                     </div>



//                                     <span

//                                         className={`text-xs ${

//                                             player.connected

//                                                 ? "text-green-400"

//                                                 : "text-slate-500"

//                                         }`}

//                                     >

//                                         {player.connected ? "Online" : "Reconnecting..."}

//                                     </span>

//                                 </div>

//                             ))}

//                         </div>

//                     </div>



//                     <div className="mt-8 flex flex-col items-center gap-4">

//                     {room.status === "waiting" && (
//   <div className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-5">
//     <h3 className="text-lg font-bold">Game Settings</h3>
//     <p className="mt-1 text-sm text-slate-400">
//       {isHost
//         ? "Game start karne se pehle settings choose karo."
//         : "Host ne game ke liye ye settings select ki hain."}
//     </p>

//     <div className="mt-4 grid gap-4 sm:grid-cols-2">
//       <div>
//         <label htmlFor="maxPlayers" className="mb-2 block text-sm font-semibold text-slate-300">
//           Maximum Players
//         </label>
//         <select
//           id="maxPlayers"
//           value={selectedMaxPlayers}
//           onChange={(e) => setSelectedMaxPlayers(Number(e.target.value))}
//           disabled={!isHost || loading || !socketConnected}
//           className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//         >
//           {[...Array(19)].map((_, i) => i + 2).map((n) => (
//             <option key={n} value={n}>{n} players</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <label htmlFor="rounds" className="mb-2 block text-sm font-semibold text-slate-300">
//           Number of Rounds
//         </label>
//         <select
//           id="rounds"
//           value={selectedRounds}
//           onChange={(e) => setSelectedRounds(Number(e.target.value))}
//           disabled={!isHost || loading || !socketConnected}
//           className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//         >
//           {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
//             <option key={n} value={n}>{n} {n === 1 ? "Round" : "Rounds"}</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <label htmlFor="drawTime" className="mb-2 block text-sm font-semibold text-slate-300">
//           Drawing Time
//         </label>
//         <select
//           id="drawTime"
//           value={selectedDrawTime}
//           onChange={(e) => setSelectedDrawTime(Number(e.target.value))}
//           disabled={!isHost || loading || !socketConnected}
//           className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//         >
//           {[15, 30, 45, 60, 90, 120, 180, 240].map((n) => (
//             <option key={n} value={n}>{n} seconds</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <label htmlFor="wordChoiceCount" className="mb-2 block text-sm font-semibold text-slate-300">
//           Word Choices per Turn
//         </label>
//         <select
//           id="wordChoiceCount"
//           value={selectedWordChoiceCount}
//           onChange={(e) => setSelectedWordChoiceCount(Number(e.target.value))}
//           disabled={!isHost || loading || !socketConnected}
//           className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//         >
//           {[1, 2, 3, 4, 5].map((n) => (
//             <option key={n} value={n}>{n} {n === 1 ? "choice" : "choices"}</option>
//           ))}
//         </select>
//       </div>

//       <div>
//         <label htmlFor="hintCount" className="mb-2 block text-sm font-semibold text-slate-300">
//           Hints per Turn
//         </label>
//         <select
//           id="hintCount"
//           value={selectedHintCount}
//           onChange={(e) => setSelectedHintCount(Number(e.target.value))}
//           disabled={!isHost || loading || !socketConnected}
//           className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
//         >
//           {[0, 1, 2, 3, 4, 5].map((n) => (
//             <option key={n} value={n}>{n} {n === 1 ? "hint" : "hints"}</option>
//           ))}
//         </select>
//       </div>
//     </div>
//     {!isHost && (
//       <p className="mt-3 text-xs text-slate-500">
//         Sirf room host settings change kar sakta hai.
//       </p>
//     )}
//   </div>
// )}

// {room.status === "waiting" && isHost && (

//                             <button

//                                 onClick={handleStartGame}

//                                 disabled={

//                                     loading ||

//                                     !socketConnected ||

//                                     room.players?.filter((p) => p.connected).length < 2

//                                 }

//                                 className="rounded-xl bg-green-600 px-8 py-3 font-bold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"

//                             >

//                                 Start Game

//                             </button>

//                         )}



//                         {room.status === "waiting" && (

//                             <p className="text-center text-sm text-slate-400">

//                                 Host game start kar sakta hai. Kam se kam 2 players chahiye.

//                             </p>

//                         )}



//                         {room.status === "choosing" && (

//                             <div className="w-full rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5">

//                                 <h3 className="text-xl font-bold text-indigo-300">

//                                     {isDrawer

//                                         ? "Choose a word!"

//                                         : "Drawer is choosing a word..."}

//                                 </h3>



//                                 {isDrawer && wordChoices.length > 0 && (

//                                     <div className="mt-4 flex flex-wrap gap-3">

//                                         {wordChoices.map((word) => (

//                                             <button

//                                                 key={word}

//                                                 onClick={() => {

//                                                     socket.emit(

//                                                         "game:choose-word",

//                                                         { word },

//                                                         (response) => {

//                                                             if (!response?.success) {

//                                                                 dispatch(

//                                                                     setError(

//                                                                         response?.message ||

//                                                                             "Word select nahi ho paya."

//                                                                     )

//                                                                 );

//                                                             }

//                                                         }

//                                                     );

//                                                 }}

//                                                 className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold hover:bg-indigo-500"

//                                             >

//                                                 {word}

//                                             </button>

//                                         ))}

//                                     </div>

//                                 )}

//                             </div>

//                         )}



//                         {(room.status === "drawing" ||

//                             room.status === "round-ended") && (

//                             <>

//                                 {room.status === "round-ended" && (

//                                     <div className="mb-4 rounded-xl bg-red-100 p-4 text-center font-bold text-red-700">

//                                         ⏰ Time&apos;s Up! Round has ended.

//                                     </div>

//                                 )}



//                                 {room.status === "drawing" && (

//                                     <div className="mb-4 text-center text-2xl font-bold">

//                                         ⏱️ Time Left: {timeLeft}s

//                                     </div>

//                                 )}



//                                 {room.status === "drawing" && (
//                                     <div className="mb-4 rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-center">
//                                         {isDrawer ? (
//                                             <p className="text-lg font-semibold text-indigo-200">
//                                                 Your word: <span className="text-2xl font-black text-white">{selectedWord || "Loading..."}</span>
//                                             </p>
//                                         ) : (
//                                             <div>
//                                                 <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">
//                                                     Hint {hintsRevealed}/{totalHints || room.hintCount || 0}
//                                                 </p>
//                                                 <p className="mt-1 text-xs font-medium text-indigo-200">
//                                                     Word length: {currentHint ? currentHint.trim().split(/\s+/).filter(Boolean).length : "—"} letters
//                                                 </p>
//                                                 <p className="mt-1 text-2xl font-black tracking-widest text-white">
//                                                     {currentHint || "Waiting for hint..."}
//                                                 </p>
//                                             </div>
//                                         )}
//                                     </div>
//                                 )}

//                                 <style>{`
//                                     .guessing-canvas button,
//                                     .guessing-canvas input,
//                                     .guessing-canvas label,
//                                     .guessing-canvas select {
//                                         display: none !important;
//                                     }
//                                 `}</style>
//                                 <div className={isDrawer && room.status === "drawing" ? "drawing-canvas-area" : "drawing-canvas-area guessing-canvas"}>
//                                     <DrawingCanvas
//                                         socket={socket}
//                                         isDrawer={isDrawer && room.status === "drawing"}
//                                     />
//                                 </div>



//                                 <div className="mt-6 w-full rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

//                                     <h3 className="mb-3 text-lg font-bold text-gray-800">

//                                         💬 Guessing Chat

//                                     </h3>



//                                     <div className="mb-4 flex h-64 flex-col gap-2 overflow-y-auto rounded-lg bg-gray-50 p-3">

//                                         {chatMessages.map((msg, index) => (

//                                             <p

//                                                 key={`${msg.createdAt}-${index}`}

//                                                 className="break-words text-sm text-gray-800"

//                                             >

//                                                 <span className="font-semibold text-indigo-600">

//                                                     {msg.username}:

//                                                 </span>{" "}

//                                                 {msg.message}

//                                             </p>

//                                         ))}

//                                     </div>



//                                     {!isDrawer && room.status === "drawing" && (
//                                     <form

//                                         onSubmit={(e) => {

//                                             e.preventDefault();



//                                             const message = chatInput.trim();



//                                             if (!message || !socket) return;



//                                             socket.emit(

//                                                 "chat:guess",

//                                                 { message },

//                                                 (response) => {

//                                                     if (!response?.success) {

//                                                         dispatch(

//                                                             setError(

//                                                                 response?.message ||

//                                                                     "Message send nahi hua"

//                                                             )

//                                                         );

//                                                     }

//                                                 }

//                                             );



//                                             setChatInput("");

//                                         }}

//                                         className="flex gap-2"

//                                     >

//                                         <input

//                                             type="text"

//                                             value={chatInput}

//                                             onChange={(e) => setChatInput(e.target.value)}

//                                             maxLength={100}

//                                             placeholder="Guess the word..."

//                                             className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-black outline-none focus:border-indigo-500"

//                                         />



//                                         <button

//                                             type="submit"

//                                             className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"

//                                         >

//                                             Send

//                                         </button>

//                                     </form>
//                                     )}

//                                 </div>

//                             </>

//                         )}

//                     </div>

//                 </section>

//             )}

//         </main>

//     </div>

// );



// }
