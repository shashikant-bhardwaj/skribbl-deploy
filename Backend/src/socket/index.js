import {
    bindSocket,
    createRoom,
    joinRoom,
    joinPublicMatchmaking,
    getPlayerRoom,
    removeSocket,
    leaveRoom,
    getPublicRoomState,
    startGame,
    chooseWord,
    getRoom,
    startNextTurn,
    getWinner,
    requestRematch,
    startRematch,
} from "../game/roomManager.js";

const turnTimers = new Map();
const hintTimers = new Map();

const hostDisconnectTimers = new Map();

const pendingHostTransfers = new Set();

// Canvas size used by the client (width x height).
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;

// Upper limit of drawing events stored per turn (for late joiners).
const MAX_STORED_DRAWING_EVENTS = 30000;

/**
 * Stores a drawing event on the room so players who join (or reconnect)
 * during a turn can see the drawing so far.
 * "start" and "fill" begin a new undoable action; "move" extends the last one.
 */
const recordDrawingEvent = (room, event) => {
    if (!room.drawingActions) {
        room.drawingActions = [];
        room.drawingEventCount = 0;
    }

    if (room.drawingEventCount >= MAX_STORED_DRAWING_EVENTS) return;

    if (event.type === "move") {
        const lastAction = room.drawingActions[room.drawingActions.length - 1];

        if (!lastAction) return;

        lastAction.push(event);
    } else {
        room.drawingActions.push([event]);
    }

    room.drawingEventCount += 1;
};

const removeLastDrawingAction = (room) => {
    const removed = room.drawingActions?.pop();

    if (removed) {
        room.drawingEventCount -= removed.length;
    }
};

const clearStoredDrawing = (room) => {
    room.drawingActions = [];
    room.drawingEventCount = 0;
};

const registerSocketHandlers = (io) => {
    const transferHostIfPossible = (room, io) => {
        if (!room) return;

        const host = room.players.find((player) => player.isHost);

        // Host is back, so no transfer is needed.
        if (!host || host.connected) {
            pendingHostTransfers.delete(room.roomCode);
            return;
        }

        const newHost = room.players.find((player) => player.connected);

        // Nobody is connected yet. Retry when a player reconnects.
        if (!newHost) {
            pendingHostTransfers.add(room.roomCode);
            return;
        }

        host.isHost = false;
        newHost.isHost = true;

        pendingHostTransfers.delete(room.roomCode);

        io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

        console.log("Host transferred to:", newHost.username);
    };

    const broadcastRoomState = (room) => {
        io.to(room.roomCode).emit("room:state", getPublicRoomState(room));
    };

    // Ends the current drawing turn (time is up, or everyone guessed the word)
    // and starts the next turn after a short pause.
    const endTurn = (roomCode, expectedTurnEndsAt) => {
        const currentRoom = getRoom(roomCode);

        if (!currentRoom) {
            turnTimers.delete(roomCode);
            return;
        }

        // Only end a turn that is still active (and is the expected one, if given).
        if (
            currentRoom.status !== "drawing" ||
            (expectedTurnEndsAt !== undefined &&
                currentRoom.turnEndsAt !== expectedTurnEndsAt)
        ) {
            return;
        }

        // Stop the turn timer and the hint timer.
        const activeTurnTimer = turnTimers.get(roomCode);
        if (activeTurnTimer) clearTimeout(activeTurnTimer);
        turnTimers.delete(roomCode);

        const activeHintTimer = hintTimers.get(roomCode);
        if (activeHintTimer) clearInterval(activeHintTimer);
        hintTimers.delete(roomCode);

        currentRoom.status = "round-ended";
        currentRoom.turnEndsAt = null;
        currentRoom.roundEndedAt = Date.now();

        io.to(roomCode).emit("game:time-up", {
            message: "Time is up!",
        });

        broadcastRoomState(currentRoom);

        // Start the next turn after 3 seconds.
        const nextTurnTimer = setTimeout(() => {
            try {
                const {
                    room: nextRoom,
                    drawer: nextDrawer,
                    choices,
                } = startNextTurn(roomCode);

                console.log("NEXT TURN DEBUG:", {
                    status: nextRoom.status,
                    drawer: nextDrawer?.username,
                    choices,
                });

                // Send the updated state to all players.
                broadcastRoomState(nextRoom);

                // If all rounds are finished, announce the final winner.
                if (nextRoom.status === "finished") {
                    const winner = getWinner(nextRoom);

                    io.to(nextRoom.roomCode).emit("game:finished", {
                        winner: winner
                            ? {
                                  playerId: winner.playerId,
                                  username: winner.username,
                                  score: winner.score,
                              }
                            : null,

                        leaderboard: [...nextRoom.players]
                            .sort((a, b) => b.score - a.score)
                            .map((player) => ({
                                playerId: player.playerId,
                                username: player.username,
                                score: player.score,
                            })),
                    });

                    return;
                }

                // Send word choices only to the new drawer.
                if (nextDrawer) {
                    io.to(nextDrawer.socketId).emit("game:word-choices", choices);
                }
            } catch (error) {
                console.error("Next turn start failed:", error.message);
            } finally {
                turnTimers.delete(roomCode);
            }
        }, 3000);

        turnTimers.set(roomCode, nextTurnTimer);
    };

    // If every connected guesser has guessed the word, end the turn right away.
    const endTurnIfEveryoneGuessed = (room) => {
        if (!room || room.status !== "drawing") return;

        const guessers = room.players.filter(
            (player) => player.connected && player.playerId !== room.currentDrawer
        );

        if (
            guessers.length > 0 &&
            guessers.every((player) => room.guessedPlayers.includes(player.playerId))
        ) {
            endTurn(room.roomCode);
        }
    };

    io.on("connection", (socket) => {
        const playerId = socket.handshake.auth?.playerId;

        if (typeof playerId !== "string" || playerId.length > 100) {
            socket.disconnect(true);
            return;
        }

        // Restore this player's previous room after a page refresh.
        const existingRoom = bindSocket(playerId, socket.id);

        // Cancel host disconnect timer if the player reconnects.
        const reconnectTimer = hostDisconnectTimers.get(playerId);

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            hostDisconnectTimers.delete(playerId);
        }

        if (existingRoom && pendingHostTransfers.has(existingRoom.roomCode)) {
            transferHostIfPossible(existingRoom, io);
        }

        if (existingRoom) {
            socket.join(existingRoom.roomCode);

            io.to(existingRoom.roomCode).emit(
                "room:state",
                getPublicRoomState(existingRoom)
            );

            socket.emit("room:reconnected", getPublicRoomState(existingRoom));

            // A drawer who reconnects while choosing a word gets the choices again.
            if (
                existingRoom.status === "choosing" &&
                existingRoom.currentDrawer === playerId &&
                existingRoom.wordChoices?.length
            ) {
                socket.emit("game:word-choices", [...existingRoom.wordChoices]);
            }
        }

        console.log("Player connected:", socket.id);

        const sendError = (ack, error) => {
            const response = {
                success: false,
                message: error.message || "Something went wrong",
            };

            if (typeof ack === "function") {
                ack(response);
            } else {
                socket.emit("room:error", response);
            }
        };

        const sendRoomState = (room, ack) => {
            const state = getPublicRoomState(room);

            io.to(room.roomCode).emit("room:state", state);

            if (typeof ack === "function") {
                ack({
                    success: true,
                    data: state,
                });
            }
        };

        // Create a private or public room.
        socket.on("room:create", (payload = {}, ack) => {
            try {
                const room = createRoom({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                    type: payload.type ?? "private",
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Join a room using its code (also works while a game is running).
        socket.on("room:join", (payload = {}, ack) => {
            try {
                const room = joinRoom({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                    roomCode: payload.roomCode,
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Find an available public room.
        socket.on("matchmaking:join", (payload = {}, ack) => {
            try {
                const room = joinPublicMatchmaking({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Explicitly leave the room.
        socket.on("room:leave", (ack) => {
            try {
                const currentRoom = getPlayerRoom(playerId);

                if (!currentRoom) {
                    if (typeof ack === "function") {
                        ack({ success: true });
                    }

                    return;
                }

                const roomCode = currentRoom.roomCode;

                const result = leaveRoom(playerId);

                socket.leave(roomCode);

                if (result?.room) {
                    io.to(roomCode).emit(
                        "room:state",
                        getPublicRoomState(result.room)
                    );

                    endTurnIfEveryoneGuessed(result.room);
                } else {
                    io.to(roomCode).emit("room:closed", {
                        roomCode,
                    });
                }

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Player requests a rematch.
        socket.on("rematch:request", (ack) => {
            try {
                const room = requestRematch(playerId);

                // Update every player's rematch lobby state.
                io.to(room.roomCode).emit("rematch:state", {
                    roomCode: room.roomCode,

                    players: room.players
                        .filter((player) =>
                            room.rematchPlayers.includes(player.playerId)
                        )
                        .map((player) => ({
                            playerId: player.playerId,
                            username: player.username,
                            isHost: player.isHost,
                        })),

                    readyCount: room.rematchPlayers.filter((id) =>
                        room.players.some(
                            (player) => player.playerId === id && player.connected
                        )
                    ).length,
                });

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Host starts the rematch.
        socket.on("rematch:start", (ack) => {
            try {
                const oldRoom = getPlayerRoom(playerId);

                if (!oldRoom) {
                    throw new Error("Room not found");
                }

                const roomCode = oldRoom.roomCode;

                const { room, drawer, choices, excludedPlayers } =
                    startRematch(playerId);

                // Remove excluded players from the Socket.IO room.
                for (const player of excludedPlayers) {
                    if (player.socketId) {
                        const playerSocket = io.sockets.sockets.get(player.socketId);

                        playerSocket?.leave(roomCode);
                    }
                }

                const oldHintTimer = hintTimers.get(roomCode);
                if (oldHintTimer) clearInterval(oldHintTimer);
                hintTimers.delete(roomCode);

                // Cancel any leftover timer from the previous game.
                const existingTimer = turnTimers.get(roomCode);

                if (existingTimer) {
                    clearTimeout(existingTimer);
                    turnTimers.delete(roomCode);
                }

                // Clear old drawing and update all remaining players.
                clearStoredDrawing(room);
                io.to(roomCode).emit("drawing:clear");
                sendRoomState(room);

                // Notify clients that the rematch has started.
                io.to(roomCode).emit("rematch:started");

                // Only the new drawer receives the word choices.
                io.to(drawer.socketId).emit("game:word-choices", choices);

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Start game — only the host can start it.
        socket.on("game:start", (payload = {}, ack) => {
            try {
                const { room, drawer, choices } = startGame(playerId, payload);

                // Send public room state to everyone.
                io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

                // Send word choices ONLY to the drawer.
                io.to(drawer.socketId).emit("game:word-choices", choices);

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        // The drawer asks again if the word choices never arrived.
        socket.on("game:request-word-choices", () => {
            const room = getPlayerRoom(playerId);

            if (
                !room ||
                room.status !== "choosing" ||
                room.currentDrawer !== playerId ||
                !room.wordChoices?.length
            ) {
                return;
            }

            socket.emit("game:word-choices", [...room.wordChoices]);
        });

        // Drawer selects one of the offered words.
        socket.on("game:choose-word", (payload, ack) => {
            try {
                const room = chooseWord({
                    playerId,
                    word: payload.word,
                });

                // Clear any old timer.
                const existingTimer = turnTimers.get(room.roomCode);

                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // Send the updated room state to all players.
                sendRoomState(room, ack);

                const initialMask = [...room.secretWord]
                    .map((ch) => (/[a-z]/i.test(ch) ? "_" : ch))
                    .join(" ");

                // Remember the current hint so late joiners can receive it.
                room.currentHint = initialMask;

                io.to(room.roomCode).emit("game:hint-reset", {
                    hint: initialMask,
                    hintCount: room.hintCount || 0,
                });

                // Send the selected word privately to the drawer.
                socket.emit("game:word-selected", {
                    word: room.secretWord,
                });

                // Save the end time of the current turn.
                const expectedTurnEndsAt = room.turnEndsAt;

                if (room.hintCount > 0) {
                    let hintsSent = 0;
                    // Reveal letters from different positions, not from the beginning of the word.
                    const wordCharacters = [...room.secretWord];
                    const letterPositions = wordCharacters
                        .map((character, index) =>
                            /[a-z]/i.test(character) ? index : -1
                        )
                        .filter((index) => index !== -1);
                    // Shuffle once so each turn has a stable, progressive reveal order.
                    for (let i = letterPositions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [letterPositions[i], letterPositions[j]] = [
                            letterPositions[j],
                            letterPositions[i],
                        ];
                    }
                    const revealOrder = letterPositions.slice(
                        0,
                        Math.min(
                            room.hintCount,
                            Math.max(0, letterPositions.length - 1)
                        )
                    );
                    const hintInterval = Math.max(
                        1000,
                        Math.floor((room.drawTime * 1000) / (room.hintCount + 1))
                    );
                    const hintTimer = setInterval(() => {
                        const currentRoom = getRoom(room.roomCode);
                        if (
                            !currentRoom ||
                            currentRoom.status !== "drawing" ||
                            currentRoom.turnEndsAt !== expectedTurnEndsAt ||
                            hintsSent >= revealOrder.length
                        ) {
                            clearInterval(hintTimer);
                            hintTimers.delete(room.roomCode);
                            return;
                        }
                        hintsSent += 1;
                        currentRoom.hintsRevealed = hintsSent;
                        const revealedPositions = new Set(
                            revealOrder.slice(0, hintsSent)
                        );
                        const hint = wordCharacters
                            .map((character, index) => {
                                if (!/[a-z]/i.test(character)) return character;
                                return revealedPositions.has(index)
                                    ? character.toUpperCase()
                                    : "_";
                            })
                            .join(" ");
                        currentRoom.currentHint = hint;
                        io.to(room.roomCode).emit("game:hint", {
                            hint,
                            hintsRevealed: hintsSent,
                            hintCount: room.hintCount,
                            wordLength: letterPositions.length,
                        });
                        if (hintsSent >= revealOrder.length) {
                            clearInterval(hintTimer);
                            hintTimers.delete(room.roomCode);
                        }
                    }, hintInterval);
                    hintTimers.set(room.roomCode, hintTimer);
                }

                // End the current turn when the drawing time runs out.
                const timer = setTimeout(() => {
                    endTurn(room.roomCode, expectedTurnEndsAt);
                }, room.drawTime * 1000);

                turnTimers.set(room.roomCode, timer);
            } catch (error) {
                sendError(ack, error);
            }
        });

        /* ---------------------------------------------------------------- */
        /* Real-time drawing events                                          */
        /* ---------------------------------------------------------------- */

        socket.on("drawing:start", (payload = {}) => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            if (room.status !== "drawing" || room.currentDrawer !== playerId) {
                return;
            }

            const { x, y, color, brushSize } = payload;

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color) ||
                !Number.isFinite(brushSize) ||
                brushSize < 1 ||
                brushSize > 20
            ) {
                return;
            }

            recordDrawingEvent(room, { type: "start", x, y, color, brushSize });

            socket.to(room.roomCode).emit("drawing:start", {
                playerId,
                x,
                y,
                color,
                brushSize,
            });
        });

        socket.on("drawing:move", (payload = {}) => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            if (room.status !== "drawing" || room.currentDrawer !== playerId) {
                return;
            }

            const { x, y, color, brushSize } = payload;

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color) ||
                !Number.isFinite(brushSize) ||
                brushSize < 1 ||
                brushSize > 20
            ) {
                return;
            }

            recordDrawingEvent(room, { type: "move", x, y, color, brushSize });

            socket.to(room.roomCode).emit("drawing:move", {
                playerId,
                x,
                y,
                color,
                brushSize,
            });
        });

        // Paint bucket: fill an area with a color.
        socket.on("drawing:fill", (payload = {}) => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            if (room.status !== "drawing" || room.currentDrawer !== playerId) {
                return;
            }

            const { x, y, color } = payload;

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                x < 0 ||
                x > CANVAS_WIDTH ||
                y < 0 ||
                y > CANVAS_HEIGHT ||
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color)
            ) {
                return;
            }

            recordDrawingEvent(room, { type: "fill", x, y, color });

            socket.to(room.roomCode).emit("drawing:fill", {
                playerId,
                x,
                y,
                color,
            });
        });

        socket.on("drawing:clear", () => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            if (room.status !== "drawing" || room.currentDrawer !== playerId) {
                return;
            }

            clearStoredDrawing(room);

            socket.to(room.roomCode).emit("drawing:clear", {
                playerId,
            });
        });

        socket.on("drawing:undo", () => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            // Only the current drawer can undo.
            if (room.status !== "drawing" || room.currentDrawer !== playerId) {
                return;
            }

            removeLastDrawingAction(room);

            socket.to(room.roomCode).emit("drawing:undo");
        });

        // A client asks for the current drawing state when its board appears
        // (late join, refresh or reconnect).
        socket.on("drawing:sync-request", () => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

            if (room.status !== "drawing" && room.status !== "round-ended") {
                return;
            }

            const events = (room.drawingActions || []).flat().map((event) => ({
                type: event.type,
                x: event.x,
                y: event.y,
                color: event.color,
                brushSize: event.brushSize,
            }));

            socket.emit("drawing:sync", { events });

            if (room.status !== "drawing") return;

            if (playerId === room.currentDrawer) {
                // The drawer gets the secret word back after a refresh.
                if (room.secretWord) {
                    socket.emit("game:word-selected", { word: room.secretWord });
                }
            } else if (room.currentHint) {
                // Guessers get the current hint.
                socket.emit("game:hint", {
                    hint: room.currentHint,
                    hintsRevealed: room.hintsRevealed || 0,
                    hintCount: room.hintCount || 0,
                });
            }
        });

        // A disconnect is temporary; retain the player for refresh recovery.
        socket.on("disconnect", (reason) => {
            const room = removeSocket(socket.id);

            if (room) {
                const disconnectedPlayer = room.players.find(
                    (player) => player.socketId === socket.id
                );

                io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

                // Start grace period only if the disconnected player is the host.
                if (disconnectedPlayer?.isHost) {
                    const playerId = disconnectedPlayer.playerId;

                    // Prevent duplicate timers for the same host.
                    const existingTimer = hostDisconnectTimers.get(playerId);

                    if (existingTimer) {
                        clearTimeout(existingTimer);
                    }

                    const timer = setTimeout(() => {
                        hostDisconnectTimers.delete(playerId);

                        const currentRoom = getPlayerRoom(playerId);

                        if (!currentRoom) return;

                        const host = currentRoom.players.find(
                            (player) => player.playerId === playerId
                        );

                        // Host has reconnected or is no longer the host.
                        if (!host || host.connected || !host.isHost) {
                            return;
                        }

                        transferHostIfPossible(currentRoom, io);
                    }, 15000);

                    hostDisconnectTimers.set(playerId, timer);
                }
            }

            console.log("Player disconnected:", socket.id, "Reason:", reason);
        });

        socket.on("chat:guess", (payload, ack) => {
            try {
                const room = getPlayerRoom(playerId);

                if (!room) {
                    throw new Error("Room not found");
                }

                if (room.status !== "drawing" && room.status !== "round-ended") {
                    throw new Error("Chat is not active");
                }

                const message = payload?.message?.trim();

                if (!message) {
                    throw new Error("Message cannot be empty");
                }

                if (message.length > 100) {
                    throw new Error("Message must be 100 characters or less");
                }

                const player = room.players.find((p) => p.playerId === playerId);

                if (!player || !player.connected) {
                    throw new Error("Player not found");
                }

                const isCorrectGuess =
                    room.status === "drawing" &&
                    playerId !== room.currentDrawer &&
                    !room.guessedPlayers.includes(playerId) &&
                    message.toLowerCase() === room.secretWord.toLowerCase();

                if (isCorrectGuess) {
                    // Record the order of correct guesses.
                    room.guessedPlayers.push(playerId);

                    // Points depend on the guess order.
                    const guessPoints = [10, 7, 5, 3];

                    const guessOrder = room.guessedPlayers.length;

                    const points =
                        guessPoints[Math.min(guessOrder - 1, guessPoints.length - 1)];

                    // Give points to the guesser.
                    player.score += points;

                    // Record the guesser's updated score.
                    room.scoreHistory.push({
                        playerId: player.playerId,
                        score: player.score,
                        timestamp: Date.now(),
                    });

                    // The drawer gets 5 points for every correct guess.
                    const drawer = room.players.find(
                        (p) => p.playerId === room.currentDrawer
                    );

                    if (drawer) {
                        drawer.score += 5;

                        // Record the drawer's updated score.
                        room.scoreHistory.push({
                            playerId: drawer.playerId,
                            score: drawer.score,
                            timestamp: Date.now(),
                        });
                    }

                    io.to(room.roomCode).emit("game:correct-guess", {
                        playerId,
                        username: player.username,
                        points,
                        message: `${player.username} guessed correctly and earned ${points} points!`,
                    });

                    // Send the updated scores to all players.
                    sendRoomState(room);

                    if (typeof ack === "function") {
                        ack({ success: true, correct: true });
                    }

                    // Everyone guessed: no need to wait for the timer.
                    endTurnIfEveryoneGuessed(room);

                    return;
                }

                const chatMessage = {
                    playerId,
                    username: player.username,
                    message,
                    createdAt: Date.now(),
                };

                io.to(room.roomCode).emit("chat:message", chatMessage);

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });
    });
};

export { registerSocketHandlers };




























// import {
//     bindSocket,
//     createRoom,
//     joinRoom,
//     joinPublicMatchmaking,
//     getPlayerRoom,
//     removeSocket,
//     leaveRoom,
//     getPublicRoomState,
//     startGame,
//     chooseWord,
//     getRoom,
//     startNextTurn,
//     getWinner,
//     requestRematch,
//     startRematch,
// } from "../game/roomManager.js";

// const turnTimers = new Map();
// const hintTimers = new Map();

// const hostDisconnectTimers = new Map();

// const pendingHostTransfers = new Set();

// // Canvas size used by the client (width x height).
// const CANVAS_WIDTH = 900;
// const CANVAS_HEIGHT = 500;

// // Upper limit of drawing events stored per turn (for late joiners).
// const MAX_STORED_DRAWING_EVENTS = 30000;

// /**
//  * Stores a drawing event on the room so players who join (or reconnect)
//  * during a turn can see the drawing so far.
//  * "start" and "fill" begin a new undoable action; "move" extends the last one.
//  */
// const recordDrawingEvent = (room, event) => {
//     if (!room.drawingActions) {
//         room.drawingActions = [];
//         room.drawingEventCount = 0;
//     }

//     if (room.drawingEventCount >= MAX_STORED_DRAWING_EVENTS) return;

//     if (event.type === "move") {
//         const lastAction = room.drawingActions[room.drawingActions.length - 1];

//         if (!lastAction) return;

//         lastAction.push(event);
//     } else {
//         room.drawingActions.push([event]);
//     }

//     room.drawingEventCount += 1;
// };

// const removeLastDrawingAction = (room) => {
//     const removed = room.drawingActions?.pop();

//     if (removed) {
//         room.drawingEventCount -= removed.length;
//     }
// };

// const clearStoredDrawing = (room) => {
//     room.drawingActions = [];
//     room.drawingEventCount = 0;
// };

// const registerSocketHandlers = (io) => {
//     const transferHostIfPossible = (room, io) => {
//         if (!room) return;

//         const host = room.players.find((player) => player.isHost);

//         // Host is back, so no transfer is needed.
//         if (!host || host.connected) {
//             pendingHostTransfers.delete(room.roomCode);
//             return;
//         }

//         const newHost = room.players.find((player) => player.connected);

//         // Nobody is connected yet. Retry when a player reconnects.
//         if (!newHost) {
//             pendingHostTransfers.add(room.roomCode);
//             return;
//         }

//         host.isHost = false;
//         newHost.isHost = true;

//         pendingHostTransfers.delete(room.roomCode);

//         io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

//         console.log("Host transferred to:", newHost.username);
//     };

//     const broadcastRoomState = (room) => {
//         io.to(room.roomCode).emit("room:state", getPublicRoomState(room));
//     };

//     // Ends the current drawing turn (time is up, or everyone guessed the word)
//     // and starts the next turn after a short pause.
//     const endTurn = (roomCode, expectedTurnEndsAt) => {
//         const currentRoom = getRoom(roomCode);

//         if (!currentRoom) {
//             turnTimers.delete(roomCode);
//             return;
//         }

//         // Only end a turn that is still active (and is the expected one, if given).
//         if (
//             currentRoom.status !== "drawing" ||
//             (expectedTurnEndsAt !== undefined &&
//                 currentRoom.turnEndsAt !== expectedTurnEndsAt)
//         ) {
//             return;
//         }

//         // Stop the turn timer and the hint timer.
//         const activeTurnTimer = turnTimers.get(roomCode);
//         if (activeTurnTimer) clearTimeout(activeTurnTimer);
//         turnTimers.delete(roomCode);

//         const activeHintTimer = hintTimers.get(roomCode);
//         if (activeHintTimer) clearInterval(activeHintTimer);
//         hintTimers.delete(roomCode);

//         currentRoom.status = "round-ended";
//         currentRoom.turnEndsAt = null;
//         currentRoom.roundEndedAt = Date.now();

//         io.to(roomCode).emit("game:time-up", {
//             message: "Time is up!",
//         });

//         broadcastRoomState(currentRoom);

//         // Start the next turn after 3 seconds.
//         const nextTurnTimer = setTimeout(() => {
//             try {
//                 const {
//                     room: nextRoom,
//                     drawer: nextDrawer,
//                     choices,
//                 } = startNextTurn(roomCode);

//                 console.log("NEXT TURN DEBUG:", {
//                     status: nextRoom.status,
//                     drawer: nextDrawer?.username,
//                     choices,
//                 });

//                 // Send the updated state to all players.
//                 broadcastRoomState(nextRoom);

//                 // If all rounds are finished, announce the final winner.
//                 if (nextRoom.status === "finished") {
//                     const winner = getWinner(nextRoom);

//                     io.to(nextRoom.roomCode).emit("game:finished", {
//                         winner: winner
//                             ? {
//                                   playerId: winner.playerId,
//                                   username: winner.username,
//                                   score: winner.score,
//                               }
//                             : null,

//                         leaderboard: [...nextRoom.players]
//                             .sort((a, b) => b.score - a.score)
//                             .map((player) => ({
//                                 playerId: player.playerId,
//                                 username: player.username,
//                                 score: player.score,
//                             })),
//                     });

//                     return;
//                 }

//                 // Send word choices only to the new drawer.
//                 if (nextDrawer) {
//                     io.to(nextDrawer.socketId).emit("game:word-choices", choices);
//                 }
//             } catch (error) {
//                 console.error("Next turn start failed:", error.message);
//             } finally {
//                 turnTimers.delete(roomCode);
//             }
//         }, 3000);

//         turnTimers.set(roomCode, nextTurnTimer);
//     };

//     // If every connected guesser has guessed the word, end the turn right away.
//     const endTurnIfEveryoneGuessed = (room) => {
//         if (!room || room.status !== "drawing") return;

//         const guessers = room.players.filter(
//             (player) => player.connected && player.playerId !== room.currentDrawer
//         );

//         if (
//             guessers.length > 0 &&
//             guessers.every((player) => room.guessedPlayers.includes(player.playerId))
//         ) {
//             endTurn(room.roomCode);
//         }
//     };

//     io.on("connection", (socket) => {
//         const playerId = socket.handshake.auth?.playerId;

//         if (typeof playerId !== "string" || playerId.length > 100) {
//             socket.disconnect(true);
//             return;
//         }

//         // Restore this player's previous room after a page refresh.
//         const existingRoom = bindSocket(playerId, socket.id);

//         // Cancel host disconnect timer if the player reconnects.
//         const reconnectTimer = hostDisconnectTimers.get(playerId);

//         if (reconnectTimer) {
//             clearTimeout(reconnectTimer);
//             hostDisconnectTimers.delete(playerId);
//         }

//         if (existingRoom && pendingHostTransfers.has(existingRoom.roomCode)) {
//             transferHostIfPossible(existingRoom, io);
//         }

//         if (existingRoom) {
//             socket.join(existingRoom.roomCode);

//             io.to(existingRoom.roomCode).emit(
//                 "room:state",
//                 getPublicRoomState(existingRoom)
//             );

//             socket.emit("room:reconnected", getPublicRoomState(existingRoom));
//         }

//         console.log("Player connected:", socket.id);

//         const sendError = (ack, error) => {
//             const response = {
//                 success: false,
//                 message: error.message || "Something went wrong",
//             };

//             if (typeof ack === "function") {
//                 ack(response);
//             } else {
//                 socket.emit("room:error", response);
//             }
//         };

//         const sendRoomState = (room, ack) => {
//             const state = getPublicRoomState(room);

//             io.to(room.roomCode).emit("room:state", state);

//             if (typeof ack === "function") {
//                 ack({
//                     success: true,
//                     data: state,
//                 });
//             }
//         };

//         // Create a private or public room.
//         socket.on("room:create", (payload = {}, ack) => {
//             try {
//                 const room = createRoom({
//                     playerId,
//                     socketId: socket.id,
//                     username: payload.username,
//                     type: payload.type ?? "private",
//                 });

//                 socket.join(room.roomCode);

//                 sendRoomState(room, ack);
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Join a room using its code (also works while a game is running).
//         socket.on("room:join", (payload = {}, ack) => {
//             try {
//                 const room = joinRoom({
//                     playerId,
//                     socketId: socket.id,
//                     username: payload.username,
//                     roomCode: payload.roomCode,
//                 });

//                 socket.join(room.roomCode);

//                 sendRoomState(room, ack);
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Find an available public room.
//         socket.on("matchmaking:join", (payload = {}, ack) => {
//             try {
//                 const room = joinPublicMatchmaking({
//                     playerId,
//                     socketId: socket.id,
//                     username: payload.username,
//                 });

//                 socket.join(room.roomCode);

//                 sendRoomState(room, ack);
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Explicitly leave the room.
//         socket.on("room:leave", (ack) => {
//             try {
//                 const currentRoom = getPlayerRoom(playerId);

//                 if (!currentRoom) {
//                     if (typeof ack === "function") {
//                         ack({ success: true });
//                     }

//                     return;
//                 }

//                 const roomCode = currentRoom.roomCode;

//                 const result = leaveRoom(playerId);

//                 socket.leave(roomCode);

//                 if (result?.room) {
//                     io.to(roomCode).emit(
//                         "room:state",
//                         getPublicRoomState(result.room)
//                     );

//                     endTurnIfEveryoneGuessed(result.room);
//                 } else {
//                     io.to(roomCode).emit("room:closed", {
//                         roomCode,
//                     });
//                 }

//                 if (typeof ack === "function") {
//                     ack({ success: true });
//                 }
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Player requests a rematch.
//         socket.on("rematch:request", (ack) => {
//             try {
//                 const room = requestRematch(playerId);

//                 // Update every player's rematch lobby state.
//                 io.to(room.roomCode).emit("rematch:state", {
//                     roomCode: room.roomCode,

//                     players: room.players
//                         .filter((player) =>
//                             room.rematchPlayers.includes(player.playerId)
//                         )
//                         .map((player) => ({
//                             playerId: player.playerId,
//                             username: player.username,
//                             isHost: player.isHost,
//                         })),

//                     readyCount: room.rematchPlayers.filter((id) =>
//                         room.players.some(
//                             (player) => player.playerId === id && player.connected
//                         )
//                     ).length,
//                 });

//                 if (typeof ack === "function") {
//                     ack({ success: true });
//                 }
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Host starts the rematch.
//         socket.on("rematch:start", (ack) => {
//             try {
//                 const oldRoom = getPlayerRoom(playerId);

//                 if (!oldRoom) {
//                     throw new Error("Room not found");
//                 }

//                 const roomCode = oldRoom.roomCode;

//                 const { room, drawer, choices, excludedPlayers } =
//                     startRematch(playerId);

//                 // Remove excluded players from the Socket.IO room.
//                 for (const player of excludedPlayers) {
//                     if (player.socketId) {
//                         const playerSocket = io.sockets.sockets.get(player.socketId);

//                         playerSocket?.leave(roomCode);
//                     }
//                 }

//                 const oldHintTimer = hintTimers.get(roomCode);
//                 if (oldHintTimer) clearInterval(oldHintTimer);
//                 hintTimers.delete(roomCode);

//                 // Cancel any leftover timer from the previous game.
//                 const existingTimer = turnTimers.get(roomCode);

//                 if (existingTimer) {
//                     clearTimeout(existingTimer);
//                     turnTimers.delete(roomCode);
//                 }

//                 // Clear old drawing and update all remaining players.
//                 clearStoredDrawing(room);
//                 io.to(roomCode).emit("drawing:clear");
//                 sendRoomState(room);

//                 // Notify clients that the rematch has started.
//                 io.to(roomCode).emit("rematch:started");

//                 // Only the new drawer receives the word choices.
//                 io.to(drawer.socketId).emit("game:word-choices", choices);

//                 if (typeof ack === "function") {
//                     ack({ success: true });
//                 }
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Start game — only the host can start it.
//         socket.on("game:start", (payload = {}, ack) => {
//             try {
//                 const { room, drawer, choices } = startGame(playerId, payload);

//                 // Send public room state to everyone.
//                 io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

//                 // Send word choices ONLY to the drawer.
//                 io.to(drawer.socketId).emit("game:word-choices", choices);

//                 if (typeof ack === "function") {
//                     ack({ success: true });
//                 }
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         // Drawer selects one of the offered words.
//         socket.on("game:choose-word", (payload, ack) => {
//             try {
//                 const room = chooseWord({
//                     playerId,
//                     word: payload.word,
//                 });

//                 // Clear any old timer.
//                 const existingTimer = turnTimers.get(room.roomCode);

//                 if (existingTimer) {
//                     clearTimeout(existingTimer);
//                 }

//                 // Send the updated room state to all players.
//                 sendRoomState(room, ack);

//                 const initialMask = [...room.secretWord]
//                     .map((ch) => (/[a-z]/i.test(ch) ? "_" : ch))
//                     .join(" ");

//                 // Remember the current hint so late joiners can receive it.
//                 room.currentHint = initialMask;

//                 io.to(room.roomCode).emit("game:hint-reset", {
//                     hint: initialMask,
//                     hintCount: room.hintCount || 0,
//                 });

//                 // Send the selected word privately to the drawer.
//                 socket.emit("game:word-selected", {
//                     word: room.secretWord,
//                 });

//                 // Save the end time of the current turn.
//                 const expectedTurnEndsAt = room.turnEndsAt;

//                 if (room.hintCount > 0) {
//                     let hintsSent = 0;
//                     // Reveal letters from different positions, not from the beginning of the word.
//                     const wordCharacters = [...room.secretWord];
//                     const letterPositions = wordCharacters
//                         .map((character, index) =>
//                             /[a-z]/i.test(character) ? index : -1
//                         )
//                         .filter((index) => index !== -1);
//                     // Shuffle once so each turn has a stable, progressive reveal order.
//                     for (let i = letterPositions.length - 1; i > 0; i--) {
//                         const j = Math.floor(Math.random() * (i + 1));
//                         [letterPositions[i], letterPositions[j]] = [
//                             letterPositions[j],
//                             letterPositions[i],
//                         ];
//                     }
//                     const revealOrder = letterPositions.slice(
//                         0,
//                         Math.min(
//                             room.hintCount,
//                             Math.max(0, letterPositions.length - 1)
//                         )
//                     );
//                     const hintInterval = Math.max(
//                         1000,
//                         Math.floor((room.drawTime * 1000) / (room.hintCount + 1))
//                     );
//                     const hintTimer = setInterval(() => {
//                         const currentRoom = getRoom(room.roomCode);
//                         if (
//                             !currentRoom ||
//                             currentRoom.status !== "drawing" ||
//                             currentRoom.turnEndsAt !== expectedTurnEndsAt ||
//                             hintsSent >= revealOrder.length
//                         ) {
//                             clearInterval(hintTimer);
//                             hintTimers.delete(room.roomCode);
//                             return;
//                         }
//                         hintsSent += 1;
//                         currentRoom.hintsRevealed = hintsSent;
//                         const revealedPositions = new Set(
//                             revealOrder.slice(0, hintsSent)
//                         );
//                         const hint = wordCharacters
//                             .map((character, index) => {
//                                 if (!/[a-z]/i.test(character)) return character;
//                                 return revealedPositions.has(index)
//                                     ? character.toUpperCase()
//                                     : "_";
//                             })
//                             .join(" ");
//                         currentRoom.currentHint = hint;
//                         io.to(room.roomCode).emit("game:hint", {
//                             hint,
//                             hintsRevealed: hintsSent,
//                             hintCount: room.hintCount,
//                             wordLength: letterPositions.length,
//                         });
//                         if (hintsSent >= revealOrder.length) {
//                             clearInterval(hintTimer);
//                             hintTimers.delete(room.roomCode);
//                         }
//                     }, hintInterval);
//                     hintTimers.set(room.roomCode, hintTimer);
//                 }

//                 // End the current turn when the drawing time runs out.
//                 const timer = setTimeout(() => {
//                     endTurn(room.roomCode, expectedTurnEndsAt);
//                 }, room.drawTime * 1000);

//                 turnTimers.set(room.roomCode, timer);
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });

//         /* ---------------------------------------------------------------- */
//         /* Real-time drawing events                                          */
//         /* ---------------------------------------------------------------- */

//         socket.on("drawing:start", (payload = {}) => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             if (room.status !== "drawing" || room.currentDrawer !== playerId) {
//                 return;
//             }

//             const { x, y, color, brushSize } = payload;

//             if (
//                 !Number.isFinite(x) ||
//                 !Number.isFinite(y) ||
//                 typeof color !== "string" ||
//                 !/^#[0-9a-fA-F]{6}$/.test(color) ||
//                 !Number.isFinite(brushSize) ||
//                 brushSize < 1 ||
//                 brushSize > 20
//             ) {
//                 return;
//             }

//             recordDrawingEvent(room, { type: "start", x, y, color, brushSize });

//             socket.to(room.roomCode).emit("drawing:start", {
//                 playerId,
//                 x,
//                 y,
//                 color,
//                 brushSize,
//             });
//         });

//         socket.on("drawing:move", (payload = {}) => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             if (room.status !== "drawing" || room.currentDrawer !== playerId) {
//                 return;
//             }

//             const { x, y, color, brushSize } = payload;

//             if (
//                 !Number.isFinite(x) ||
//                 !Number.isFinite(y) ||
//                 typeof color !== "string" ||
//                 !/^#[0-9a-fA-F]{6}$/.test(color) ||
//                 !Number.isFinite(brushSize) ||
//                 brushSize < 1 ||
//                 brushSize > 20
//             ) {
//                 return;
//             }

//             recordDrawingEvent(room, { type: "move", x, y, color, brushSize });

//             socket.to(room.roomCode).emit("drawing:move", {
//                 playerId,
//                 x,
//                 y,
//                 color,
//                 brushSize,
//             });
//         });

//         // Paint bucket: fill an area with a color.
//         socket.on("drawing:fill", (payload = {}) => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             if (room.status !== "drawing" || room.currentDrawer !== playerId) {
//                 return;
//             }

//             const { x, y, color } = payload;

//             if (
//                 !Number.isFinite(x) ||
//                 !Number.isFinite(y) ||
//                 x < 0 ||
//                 x > CANVAS_WIDTH ||
//                 y < 0 ||
//                 y > CANVAS_HEIGHT ||
//                 typeof color !== "string" ||
//                 !/^#[0-9a-fA-F]{6}$/.test(color)
//             ) {
//                 return;
//             }

//             recordDrawingEvent(room, { type: "fill", x, y, color });

//             socket.to(room.roomCode).emit("drawing:fill", {
//                 playerId,
//                 x,
//                 y,
//                 color,
//             });
//         });

//         socket.on("drawing:clear", () => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             if (room.status !== "drawing" || room.currentDrawer !== playerId) {
//                 return;
//             }

//             clearStoredDrawing(room);

//             socket.to(room.roomCode).emit("drawing:clear", {
//                 playerId,
//             });
//         });

//         socket.on("drawing:undo", () => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             // Only the current drawer can undo.
//             if (room.status !== "drawing" || room.currentDrawer !== playerId) {
//                 return;
//             }

//             removeLastDrawingAction(room);

//             socket.to(room.roomCode).emit("drawing:undo");
//         });

//         // A client asks for the current drawing state when its board appears
//         // (late join, refresh or reconnect).
//         socket.on("drawing:sync-request", () => {
//             const room = getPlayerRoom(playerId);

//             if (!room) return;

//             if (room.status !== "drawing" && room.status !== "round-ended") {
//                 return;
//             }

//             const events = (room.drawingActions || []).flat().map((event) => ({
//                 type: event.type,
//                 x: event.x,
//                 y: event.y,
//                 color: event.color,
//                 brushSize: event.brushSize,
//             }));

//             socket.emit("drawing:sync", { events });

//             if (room.status !== "drawing") return;

//             if (playerId === room.currentDrawer) {
//                 // The drawer gets the secret word back after a refresh.
//                 if (room.secretWord) {
//                     socket.emit("game:word-selected", { word: room.secretWord });
//                 }
//             } else if (room.currentHint) {
//                 // Guessers get the current hint.
//                 socket.emit("game:hint", {
//                     hint: room.currentHint,
//                     hintsRevealed: room.hintsRevealed || 0,
//                     hintCount: room.hintCount || 0,
//                 });
//             }
//         });

//         // A disconnect is temporary; retain the player for refresh recovery.
//         socket.on("disconnect", (reason) => {
//             const room = removeSocket(socket.id);

//             if (room) {
//                 const disconnectedPlayer = room.players.find(
//                     (player) => player.socketId === socket.id
//                 );

//                 io.to(room.roomCode).emit("room:state", getPublicRoomState(room));

//                 // Start grace period only if the disconnected player is the host.
//                 if (disconnectedPlayer?.isHost) {
//                     const playerId = disconnectedPlayer.playerId;

//                     // Prevent duplicate timers for the same host.
//                     const existingTimer = hostDisconnectTimers.get(playerId);

//                     if (existingTimer) {
//                         clearTimeout(existingTimer);
//                     }

//                     const timer = setTimeout(() => {
//                         hostDisconnectTimers.delete(playerId);

//                         const currentRoom = getPlayerRoom(playerId);

//                         if (!currentRoom) return;

//                         const host = currentRoom.players.find(
//                             (player) => player.playerId === playerId
//                         );

//                         // Host has reconnected or is no longer the host.
//                         if (!host || host.connected || !host.isHost) {
//                             return;
//                         }

//                         transferHostIfPossible(currentRoom, io);
//                     }, 15000);

//                     hostDisconnectTimers.set(playerId, timer);
//                 }
//             }

//             console.log("Player disconnected:", socket.id, "Reason:", reason);
//         });

//         socket.on("chat:guess", (payload, ack) => {
//             try {
//                 const room = getPlayerRoom(playerId);

//                 if (!room) {
//                     throw new Error("Room not found");
//                 }

//                 if (room.status !== "drawing" && room.status !== "round-ended") {
//                     throw new Error("Chat is not active");
//                 }

//                 const message = payload?.message?.trim();

//                 if (!message) {
//                     throw new Error("Message cannot be empty");
//                 }

//                 if (message.length > 100) {
//                     throw new Error("Message must be 100 characters or less");
//                 }

//                 const player = room.players.find((p) => p.playerId === playerId);

//                 if (!player || !player.connected) {
//                     throw new Error("Player not found");
//                 }

//                 const isCorrectGuess =
//                     room.status === "drawing" &&
//                     playerId !== room.currentDrawer &&
//                     !room.guessedPlayers.includes(playerId) &&
//                     message.toLowerCase() === room.secretWord.toLowerCase();

//                 if (isCorrectGuess) {
//                     // Record the order of correct guesses.
//                     room.guessedPlayers.push(playerId);

//                     // Points depend on the guess order.
//                     const guessPoints = [10, 7, 5, 3];

//                     const guessOrder = room.guessedPlayers.length;

//                     const points =
//                         guessPoints[Math.min(guessOrder - 1, guessPoints.length - 1)];

//                     // Give points to the guesser.
//                     player.score += points;

//                     // Record the guesser's updated score.
//                     room.scoreHistory.push({
//                         playerId: player.playerId,
//                         score: player.score,
//                         timestamp: Date.now(),
//                     });

//                     // The drawer gets 5 points for every correct guess.
//                     const drawer = room.players.find(
//                         (p) => p.playerId === room.currentDrawer
//                     );

//                     if (drawer) {
//                         drawer.score += 5;

//                         // Record the drawer's updated score.
//                         room.scoreHistory.push({
//                             playerId: drawer.playerId,
//                             score: drawer.score,
//                             timestamp: Date.now(),
//                         });
//                     }

//                     io.to(room.roomCode).emit("game:correct-guess", {
//                         playerId,
//                         username: player.username,
//                         points,
//                         message: `${player.username} guessed correctly and earned ${points} points!`,
//                     });

//                     // Send the updated scores to all players.
//                     sendRoomState(room);

//                     if (typeof ack === "function") {
//                         ack({ success: true, correct: true });
//                     }

//                     // Everyone guessed: no need to wait for the timer.
//                     endTurnIfEveryoneGuessed(room);

//                     return;
//                 }

//                 const chatMessage = {
//                     playerId,
//                     username: player.username,
//                     message,
//                     createdAt: Date.now(),
//                 };

//                 io.to(room.roomCode).emit("chat:message", chatMessage);

//                 if (typeof ack === "function") {
//                     ack({ success: true });
//                 }
//             } catch (error) {
//                 sendError(ack, error);
//             }
//         });
//     });
// };

// export { registerSocketHandlers };