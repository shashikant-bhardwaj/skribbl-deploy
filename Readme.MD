# Skribbl

A real-time multiplayer drawing and guessing game. Players join a room, take turns drawing a secret word, and compete to guess what others are drawing.

## Features

- Private rooms with shareable room codes, plus Quick Match
- Join a room by code, including while a game is in progress
- Real-time drawing with color, brush size, eraser, paint bucket, undo, and clear
- Guessing chat, timer, progressive hints, scoring, and a final leaderboard
- Host-configurable settings: players, rounds, drawing time, word choices, and hints
- Turn ends early when every player has guessed the word
- Rematch support and automatic reconnection after a page refresh

## Tech Stack

| Layer    | Technologies                                          |
| -------- | ----------------------------------------------------- |
| Frontend | React, Vite, Tailwind CSS, Redux Toolkit, Socket.IO Client |
| Backend  | Node.js, Express, Socket.IO, MongoDB (Mongoose)       |

## Project Structure

```text
.
├── Backend/
│   └── src/
│       ├── db/           # Database connection
│       ├── game/         # Room and game logic (roomManager.js)
│       ├── socket/       # Socket.IO event handlers
│       └── index.js      # Server entry point
├── Frontend/
│   └── src/
│       ├── components/   # DrawingCanvas
│       ├── features/     # Redux slice (game state)
│       ├── hooks/        # useSocket
│       ├── App.jsx
│       └── main.jsx
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (LTS) and npm
- A MongoDB connection string

### Backend

Run these commands from the project root (where the backend `package.json` is).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   PORT=8000
   MONGODB_URI=<your-mongodb-connection-string>
   CLIENT_URL=http://localhost:5173
   ```

3. Start the server:

   ```bash
   npm run start
   ```

   For development with automatic restarts, use `npm run dev`.

### Frontend

1. Create `Frontend/.env`:

   ```env
   VITE_SERVER_URL=http://localhost:8000
   ```

2. Install dependencies and start the dev server:

   ```bash
   cd Frontend
   npm install
   npm run dev
   ```

3. Open the URL printed in the terminal (usually `http://localhost:5173`).

> Never commit `.env` files or credentials. Add `.env` to `.gitignore`.

## How to Play

1. Enter a username, then create a room, join with a room code, or use Quick Match.
2. The host configures the settings and starts the game (minimum 2 players).
3. The drawer picks a word and draws it. Everyone else guesses in the chat.
4. A turn ends when the timer runs out or all players have guessed correctly.
5. After the final round, view the leaderboard and request a rematch.

**Scoring:** guessers earn 10, 7, 5, then 3 points depending on how early they guess. The drawer earns 5 points for each correct guess.

## Socket Events

| Area     | Events                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------ |
| Room     | `room:create`, `room:join`, `room:leave`, `room:state`, `room:reconnected`, `room:closed`, `matchmaking:join` |
| Game     | `game:start`, `game:word-choices`, `game:choose-word`, `game:word-selected`, `game:hint`, `game:hint-reset`, `game:time-up`, `game:correct-guess`, `game:finished` |
| Chat     | `chat:guess`, `chat:message`                                                                     |
| Drawing  | `drawing:start`, `drawing:move`, `drawing:fill`, `drawing:undo`, `drawing:clear`, `drawing:sync-request`, `drawing:sync` |
| Rematch  | `rematch:request`, `rematch:state`, `rematch:start`, `rematch:started`                           |

The server validates every action (for example, only the current drawer can draw and only the host can start the game).

## Customizing the Word List

Words are defined in the `WORD_BANK` array in `Backend/src/game/roomManager.js`. Use plain letters and spaces only.

## Troubleshooting

| Problem                                   | Fix                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `ERR_CONNECTION_REFUSED` in the console   | The backend is not running, or `VITE_SERVER_URL` points to the wrong port.            |
| Request stays on "Please wait..."         | Check the backend terminal for errors and restart the server.                         |
| MongoDB connection fails                  | Verify `MONGODB_URI`, credentials, and network access rules.                          |
| Two test players act as one               | Don't use "Duplicate tab". Use a new tab, another browser, or a private window.       |
| Cannot join a running game                | The room is full or the game has already finished.                                    |

## Deployment

1. Deploy the backend to a Node.js host that supports WebSocket connections.
2. Set the production environment variables and allow the frontend origin in CORS.
3. Build the frontend. From the project root, `npm run build` installs the dependencies and builds the frontend. Deploy the result to a static host, with `VITE_SERVER_URL` pointing to the deployed backend.

## Author

**Shashikant Bhardwaj** — [GitHub](https://github.com/shashikant-bhardwaj)