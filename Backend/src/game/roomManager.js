const rooms = new Map();
const playerRooms = new Map();
const socketPlayers = new Map();

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const DEFAULT_MAX_PLAYERS = 8;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 10;
const DEFAULT_ROUNDS = 3;
const MIN_DRAW_TIME = 15;
const MAX_DRAW_TIME = 240;
const DEFAULT_DRAW_TIME = 60;
const MIN_WORD_CHOICES = 1;
const MAX_WORD_CHOICES = 5;
const DEFAULT_WORD_CHOICES = 3;
const MIN_HINTS = 0;
const MAX_HINTS = 5;
const DEFAULT_HINTS = 0;

// Players can join a room by code while it is waiting or while a game is running.
const JOINABLE_STATUSES = ["waiting", "choosing", "drawing", "round-ended"];

const WORD_BANK = [
    // Original words
    "Apple",
    "Elephant",
    "Guitar",
    "Rainbow",
    "Pizza",
    "Airplane",
    "Butterfly",
    "Castle",
    "Sunflower",
    "Rocket",
    "Mountain",
    "Penguin",
    "Ice Cream",
    "Football",
    "Turtle",

    // Animals
    "Dog",
    "Cat",
    "Lion",
    "Tiger",
    "Giraffe",
    "Monkey",
    "Zebra",
    "Kangaroo",
    "Dolphin",
    "Shark",
    "Whale",
    "Octopus",
    "Crab",
    "Spider",
    "Snake",
    "Frog",
    "Owl",
    "Eagle",
    "Parrot",
    "Duck",
    "Chicken",
    "Rabbit",
    "Horse",
    "Cow",
    "Pig",
    "Sheep",
    "Bear",
    "Wolf",
    "Fox",
    "Squirrel",
    "Bat",
    "Camel",
    "Crocodile",
    "Snail",
    "Bee",
    "Ladybug",
    "Starfish",
    "Seahorse",
    "Peacock",
    "Flamingo",

    // Food and drink
    "Banana",
    "Watermelon",
    "Strawberry",
    "Pineapple",
    "Grapes",
    "Cherry",
    "Lemon",
    "Carrot",
    "Broccoli",
    "Tomato",
    "Potato",
    "Corn",
    "Mushroom",
    "Hamburger",
    "Hot Dog",
    "French Fries",
    "Sandwich",
    "Cake",
    "Cupcake",
    "Donut",
    "Cookie",
    "Popcorn",
    "Pancake",
    "Egg",
    "Cheese",
    "Bread",
    "Coffee",
    "Milk",
    "Lollipop",
    "Chocolate",

    // Household and everyday objects
    "Chair",
    "Table",
    "Bed",
    "Lamp",
    "Clock",
    "Mirror",
    "Door",
    "Window",
    "Key",
    "Umbrella",
    "Scissors",
    "Toothbrush",
    "Soap",
    "Bucket",
    "Candle",
    "Broom",
    "Pillow",
    "Blanket",
    "Television",
    "Telephone",
    "Camera",
    "Laptop",
    "Headphones",
    "Backpack",
    "Wallet",
    "Glasses",
    "Watch",
    "Ring",
    "Crown",
    "Hat",

    // Clothing
    "Shoe",
    "Sock",
    "Dress",
    "Scarf",
    "Gloves",
    "Jacket",
    "Boot",
    "Tie",

    // Transport
    "Car",
    "Bus",
    "Train",
    "Bicycle",
    "Motorcycle",
    "Helicopter",
    "Submarine",
    "Sailboat",
    "Ambulance",
    "Fire Truck",
    "Tractor",
    "Skateboard",
    "Hot Air Balloon",
    "Tent",
    "Lighthouse",

    // Nature and weather
    "Sun",
    "Moon",
    "Star",
    "Cloud",
    "Lightning",
    "Snowman",
    "Snowflake",
    "Volcano",
    "Waterfall",
    "River",
    "Island",
    "Beach",
    "Desert",
    "Forest",
    "Tree",
    "Flower",
    "Rose",
    "Cactus",
    "Leaf",
    "Seashell",
    "Fire",
    "Tornado",
    "Cave",
    "Palm Tree",

    // Buildings and places
    "House",
    "School",
    "Hospital",
    "Bridge",
    "Windmill",
    "Igloo",
    "Pyramid",
    "Tower",
    "Fountain",
    "Farm",
    "Circus",
    "Playground",

    // Sports and toys
    "Basketball",
    "Baseball",
    "Tennis Racket",
    "Bowling Ball",
    "Trophy",
    "Medal",
    "Kite",
    "Balloon",
    "Trampoline",
    "Teddy Bear",
    "Puzzle",
    "Dice",
    "Chess",
    "Swing",
    "Slide",
    "Robot",
    "Drum",
    "Piano",
    "Violin",
    "Trumpet",

    // Tools and technology
    "Hammer",
    "Saw",
    "Ladder",
    "Screwdriver",
    "Magnet",
    "Battery",
    "Light Bulb",
    "Microscope",
    "Telescope",
    "Compass",
    "Map",
    "Globe",
    "Calculator",
    "Keyboard",
    "Computer Mouse",
    "Satellite",
    "Plug",
    "Anchor",
    "Shovel",
    "Axe",

    // Fantasy and characters
    "Dragon",
    "Unicorn",
    "Mermaid",
    "Ghost",
    "Witch",
    "Wizard",
    "Fairy",
    "Pirate",
    "Ninja",
    "Knight",
    "Alien",
    "Vampire",
    "Skeleton",
    "Pumpkin",
    "Treasure Chest",
    "Magic Wand",

    // Body and misc
    "Eye",
    "Nose",
    "Hand",
    "Foot",
    "Tooth",
    "Heart",
    "Brain",
    "Bone",
    "Flag",
    "Book",
    "Pencil",
    "Paintbrush",
    "Envelope",
    "Gift",
    "Bell",
    "Christmas Tree",
    "Fireworks",
    "Spiderweb",
    "Footprint",
    "Money",
];



const generateRoomCode = () => {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;

    do {
        code = "";

        for (let i = 0; i < 6; i++) {
            code += characters[Math.floor(Math.random() * characters.length)];
        }
    } while (rooms.has(code));

    return code;
};

const shufflePlayers = (players) => {
    const shuffled = [...players];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.map((player) => player.playerId);
};

const validateUsername = (username) => {
    if (typeof username !== "string") {
        throw new Error("Username is required");
    }

    const cleanedUsername = username.trim();

    if (cleanedUsername.length < 2 || cleanedUsername.length > 20) {
        throw new Error("Username must be 2 to 20 characters");
    }

    return cleanedUsername;
};

const bindSocket = (playerId, socketId) => {
    if (typeof playerId !== "string" || playerId.length > 100) {
        throw new Error("Invalid player ID");
    }

    // A refreshed player may have a new socket ID.
    const oldSocketId = [...socketPlayers.entries()].find(
        ([, id]) => id === playerId
    )?.[0];

    if (oldSocketId) {
        socketPlayers.delete(oldSocketId);
    }

    socketPlayers.set(socketId, playerId);

    const roomCode = playerRooms.get(playerId);
    const room = roomCode ? rooms.get(roomCode) : null;

    if (room) {
        const player = room.players.find((item) => item.playerId === playerId);

        if (player) {
            player.socketId = socketId;
            player.connected = true;
        }
    }

    return room ?? null;
};

const createRoom = ({ playerId, socketId, username, type = "private" }) => {
    if (playerRooms.has(playerId)) {
        throw new Error("You are already in a room");
    }

    if (!["private", "public"].includes(type)) {
        throw new Error("Invalid room type");
    }

    const cleanedUsername = validateUsername(username);
    const roomCode = generateRoomCode();

    const room = {
        roomCode,
        type,
        players: [
            {
                playerId,
                socketId,
                username: cleanedUsername,
                score: 0,
                isHost: true,
                connected: true,
            },
        ],
        status: "waiting",
        currentDrawer: null,
        round: 0,
        maxRounds: DEFAULT_ROUNDS,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        drawTime: DEFAULT_DRAW_TIME,
        wordChoiceCount: DEFAULT_WORD_CHOICES,
        hintCount: DEFAULT_HINTS,
        drawerOrder: [],
        drawerIndex: 0,
        turnEndsAt: null,
        guessedPlayers: [],
        roundEndedAt: null,
        rematchPlayers: [],
        drawingActions: [],
        drawingEventCount: 0,
        currentHint: "",
    };

    rooms.set(roomCode, room);
    playerRooms.set(playerId, roomCode);
    socketPlayers.set(socketId, playerId);

    return room;
};

const joinRoom = ({ playerId, socketId, username, roomCode }) => {
    if (playerRooms.has(playerId)) {
        throw new Error("You are already in a room");
    }

    if (typeof roomCode !== "string") {
        throw new Error("Room code is required");
    }

    const code = roomCode.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
        throw new Error("Room not found");
    }

    if (!JOINABLE_STATUSES.includes(room.status)) {
        throw new Error("Game has already finished");
    }

    if (room.players.length >= room.maxPlayers) {
        throw new Error("Room is full");
    }

    const player = {
        playerId,
        socketId,
        username: validateUsername(username),
        score: 0,
        isHost: false,
        connected: true,
    };

    room.players.push(player);
    playerRooms.set(playerId, code);
    socketPlayers.set(socketId, playerId);

    // Joined mid-game: add the player to the end of the current drawing order
    // so they also get a turn to draw in this round.
    if (room.status !== "waiting" && Array.isArray(room.drawerOrder)) {
        room.drawerOrder.push(playerId);
    }

    return room;
};

const joinPublicMatchmaking = ({ playerId, socketId, username }) => {
    const room = [...rooms.values()].find(
        (item) =>
            item.type === "public" &&
            item.status === "waiting" &&
            item.players.length < item.maxPlayers
    );

    if (!room) {
        return createRoom({
            playerId,
            socketId,
            username,
            type: "public",
        });
    }

    return joinRoom({
        playerId,
        socketId,
        username,
        roomCode: room.roomCode,
    });
};

const startGame = (playerId, selectedSettings = {}) => {
    const room = getPlayerRoom(playerId);
    if (!room) throw new Error("Room not found");

    const host = room.players.find((player) => player.playerId === playerId);
    if (!host?.isHost) throw new Error("Only the host can start the game");
    if (room.status !== "waiting") throw new Error("Game has already started");

    const connectedPlayers = room.players.filter((player) => player.connected);
    if (connectedPlayers.length < 2) throw new Error("At least 2 connected players are required");

    const {
        maxPlayers = room.maxPlayers,
        rounds = room.maxRounds,
        drawTime = room.drawTime,
        wordChoiceCount = room.wordChoiceCount,
        hintCount = room.hintCount,
    } = selectedSettings;
    const settings = {
        maxPlayers: Number(maxPlayers),
        rounds: Number(rounds),
        drawTime: Number(drawTime),
        wordChoiceCount: Number(wordChoiceCount),
        hintCount: Number(hintCount),
    };
    if (!Number.isInteger(settings.maxPlayers) || settings.maxPlayers < MIN_PLAYERS || settings.maxPlayers > MAX_PLAYERS) throw new Error(`Maximum players must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
    if (!Number.isInteger(settings.rounds) || settings.rounds < MIN_ROUNDS || settings.rounds > MAX_ROUNDS) throw new Error(`Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}`);
    if (!Number.isInteger(settings.drawTime) || settings.drawTime < MIN_DRAW_TIME || settings.drawTime > MAX_DRAW_TIME) throw new Error(`Drawing time must be between ${MIN_DRAW_TIME} and ${MAX_DRAW_TIME}`);
    if (!Number.isInteger(settings.wordChoiceCount) || settings.wordChoiceCount < MIN_WORD_CHOICES || settings.wordChoiceCount > MAX_WORD_CHOICES) throw new Error(`Word choices must be between ${MIN_WORD_CHOICES} and ${MAX_WORD_CHOICES}`);
    if (!Number.isInteger(settings.hintCount) || settings.hintCount < MIN_HINTS || settings.hintCount > MAX_HINTS) throw new Error(`Hints must be between ${MIN_HINTS} and ${MAX_HINTS}`);
    if (room.players.length > settings.maxPlayers) throw new Error("Maximum players cannot be less than the current number of players");

    room.maxPlayers = settings.maxPlayers;
    room.maxRounds = settings.rounds;
    room.drawTime = settings.drawTime;
    room.wordChoiceCount = settings.wordChoiceCount;
    room.hintCount = settings.hintCount;
    room.drawerOrder = shufflePlayers(connectedPlayers);
    room.drawerIndex = 0;
    const drawer = connectedPlayers.find((player) => player.playerId === room.drawerOrder[0]);
    const shuffledWords = [...WORD_BANK].sort(() => Math.random() - 0.5);
    room.status = "choosing";
    room.currentDrawer = drawer.playerId;
    room.round = 1;
    room.secretWord = null;
    room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);
    room.scoreHistory = [];
    room.guessedPlayers = [];
    room.hintsRevealed = 0;
    room.turnEndsAt = null;
    room.roundEndedAt = null;
    return { room, drawer, choices: [...room.wordChoices] };
};

const chooseWord = ({ playerId, word }) => {
    const room = getPlayerRoom(playerId);

    if (!room) {
        throw new Error("Room not found");
    }

    if (room.status !== "choosing") {
        throw new Error("Word selection is not active");
    }

    if (room.currentDrawer !== playerId) {
        throw new Error("Only the current drawer can choose a word");
    }

    if (!room.wordChoices?.includes(word)) {
        throw new Error("Invalid word choice");
    }

    room.secretWord = word;
    room.wordChoices = [];
    room.status = "drawing";

    room.turnEndsAt = Date.now() + 60 * 1000;

    // Fresh turn: forget the previous drawing and hint so late joiners get the right state.
    room.drawingActions = [];
    room.drawingEventCount = 0;
    room.currentHint = "";
    room.hintsRevealed = 0;

    return room;
};

const startNextTurn = (roomCode) => {
    const room = rooms.get(roomCode);

    if (!room) {
        throw new Error("Room not found");
    }

    const connectedPlayers = room.players.filter((player) => player.connected);

    if (connectedPlayers.length < 2) {
        room.status = "finished";
        room.currentDrawer = null;
        room.turnEndsAt = null;
        room.secretWord = null;
        room.wordChoices = [];
        room.roundEndedAt = Date.now();

        return { room, drawer: null, choices: [] };
    }

    // Find the next connected player in the current cycle.
    let nextIndex = -1;

    for (let i = room.drawerIndex + 1; i < room.drawerOrder.length; i++) {
        const player = connectedPlayers.find(
            (item) => item.playerId === room.drawerOrder[i]
        );

        if (player) {
            nextIndex = i;
            break;
        }
    }

    // Current cycle is complete.
    if (nextIndex === -1) {
        // All selected cycles are complete.
        if (room.round >= room.maxRounds) {
            room.status = "finished";
            room.currentDrawer = null;
            room.turnEndsAt = null;
            room.secretWord = null;
            room.wordChoices = [];
            room.roundEndedAt = Date.now();

            return { room, drawer: null, choices: [] };
        }

        // Begin the next cycle with a fresh player order.
        room.round += 1;
        room.drawerOrder = shufflePlayers(connectedPlayers);
        room.drawerIndex = 0;
    } else {
        // Continue the current cycle.
        room.drawerIndex = nextIndex;
    }

    const drawerId = room.drawerOrder[room.drawerIndex];

    const drawer = connectedPlayers.find((player) => player.playerId === drawerId);

    const shuffledWords = [...WORD_BANK].sort(() => Math.random() - 0.5);

    room.status = "choosing";
    room.currentDrawer = drawer.playerId;
    room.secretWord = null;
    room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);
    room.turnEndsAt = null;
    room.guessedPlayers = [];
    room.roundEndedAt = null;

    return {
        room,
        drawer,
        choices: [...room.wordChoices],
    };
};

const getRoom = (roomCode) => rooms.get(roomCode) ?? null;

const requestRematch = (playerId) => {
    const room = getPlayerRoom(playerId);

    if (!room) {
        throw new Error("Room not found");
    }

    if (room.status !== "finished") {
        throw new Error("The current game is not finished");
    }

    const player = room.players.find((item) => item.playerId === playerId);

    if (!player || !player.connected) {
        throw new Error("Player is not connected");
    }

    // Add the player only once.
    if (!room.rematchPlayers.includes(playerId)) {
        room.rematchPlayers.push(playerId);
    }

    return room;
};

const startRematch = (playerId) => {
    const room = getPlayerRoom(playerId);

    if (!room) {
        throw new Error("Room not found");
    }

    const host = room.players.find((player) => player.playerId === playerId);

    if (!host?.isHost) {
        throw new Error("Only the host can start the rematch");
    }

    if (room.status !== "finished") {
        throw new Error("The current game is not finished");
    }

    // Only connected players who requested a rematch.
    const rematchPlayers = room.players.filter(
        (player) =>
            player.connected && room.rematchPlayers.includes(player.playerId)
    );

    if (rematchPlayers.length < 2) {
        throw new Error("At least 2 connected players must be ready");
    }

    // Identify players who will not join the rematch.
    const readyIds = new Set(rematchPlayers.map((player) => player.playerId));

    const excludedPlayers = room.players.filter(
        (player) => !readyIds.has(player.playerId)
    );

    // Remove excluded players from the room mappings.
    for (const player of excludedPlayers) {
        playerRooms.delete(player.playerId);

        if (player.socketId) {
            socketPlayers.delete(player.socketId);
        }
    }

    // Keep only players who joined the rematch.
    room.players = rematchPlayers.map((player) => ({
        ...player,
        score: 0,
        isHost: player.playerId === host.playerId,
    }));

    // Reset game state.
    room.status = "choosing";
    room.round = 1;
    room.currentDrawer = null;
    room.secretWord = null;
    room.wordChoices = [];
    room.turnEndsAt = null;
    room.guessedPlayers = [];
    room.roundEndedAt = null;
    room.scoreHistory = [];
    room.rematchPlayers = [];

    room.drawerOrder = shufflePlayers(
        room.players.filter((player) => player.connected)
    );
    room.drawerIndex = 0;

    const drawer = room.players.find(
        (player) => player.playerId === room.drawerOrder[0]
    );

    const shuffledWords = [...WORD_BANK].sort(() => Math.random() - 0.5);

    room.currentDrawer = drawer.playerId;
    room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);

    return {
        room,
        drawer,
        choices: [...room.wordChoices],
        excludedPlayers,
    };
};

const getWinner = (room) => {
    if (!room.players.length) {
        return null;
    }

    // Find the highest final score.
    const highestScore = Math.max(...room.players.map((player) => player.score));

    const topPlayers = room.players.filter(
        (player) => player.score === highestScore
    );

    // No tie: return the highest-scoring player.
    if (topPlayers.length === 1) {
        return topPlayers[0];
    }

    // Tie: find who reached the final score first.
    const history = room.scoreHistory || [];

    topPlayers.sort((a, b) => {
        const aIndex = history.findIndex(
            (entry) => entry.playerId === a.playerId && entry.score >= highestScore
        );

        const bIndex = history.findIndex(
            (entry) => entry.playerId === b.playerId && entry.score >= highestScore
        );

        const aOrder = aIndex === -1 ? Infinity : aIndex;
        const bOrder = bIndex === -1 ? Infinity : bIndex;

        return aOrder - bOrder;
    });

    return topPlayers[0];
};

const getPlayerRoom = (playerId) => {
    const roomCode = playerRooms.get(playerId);
    return roomCode ? getRoom(roomCode) : null;
};

const getPlayerBySocket = (socketId) => {
    const playerId = socketPlayers.get(socketId);

    if (!playerId) return null;

    const room = getPlayerRoom(playerId);

    if (!room) return null;

    const player = room.players.find((item) => item.playerId === playerId);

    return player ? { player, room } : null;
};

const removeSocket = (socketId) => {
    const playerId = socketPlayers.get(socketId);

    if (!playerId) return null;

    socketPlayers.delete(socketId);

    const room = getPlayerRoom(playerId);

    if (!room) return null;

    const player = room.players.find((item) => item.playerId === playerId);

    // Keep the player and room so a refresh can reconnect.
    if (player && player.socketId === socketId) {
        player.connected = false;
    }

    return room;
};

const leaveRoom = (playerId) => {
    const roomCode = playerRooms.get(playerId);
    const room = roomCode ? rooms.get(roomCode) : null;

    if (!room) {
        playerRooms.delete(playerId);
        return { roomCode, room: null };
    }

    const player = room.players.find((item) => item.playerId === playerId);

    if (player?.socketId) {
        socketPlayers.delete(player.socketId);
    }

    room.players = room.players.filter((item) => item.playerId !== playerId);

    playerRooms.delete(playerId);

    if (Array.isArray(room.rematchPlayers)) {
        room.rematchPlayers = room.rematchPlayers.filter((id) => id !== playerId);
    }

    if (room.players.length === 0) {
        rooms.delete(roomCode);
        return { roomCode, room: null };
    }

    // If an active game has fewer than 2 players, close the room.
    const gameIsActive = ["choosing", "drawing", "round-ended"].includes(
        room.status
    );

    if (gameIsActive && room.players.length < 2) {
        for (const remainingPlayer of room.players) {
            playerRooms.delete(remainingPlayer.playerId);

            if (remainingPlayer.socketId) {
                socketPlayers.delete(remainingPlayer.socketId);
            }
        }

        rooms.delete(roomCode);

        return { roomCode, room: null };
    }

    // Transfer host if the previous host left.
    if (!room.players.some((item) => item.isHost)) {
        const newHost = room.players.find((item) => item.connected);

        if (newHost) {
            newHost.isHost = true;
        }
    }

    return { roomCode, room };
};

// Never send internal socket IDs to other players.
const getPublicRoomState = (room) => ({
    roomCode: room.roomCode,
    type: room.type,
    status: room.status,
    currentDrawer: room.currentDrawer,
    round: room.round,
    maxRounds: room.maxRounds,
    maxPlayers: room.maxPlayers,
    drawTime: room.drawTime,
    wordChoiceCount: room.wordChoiceCount,
    hintCount: room.hintCount,
    turnEndsAt: room.turnEndsAt,
    players: room.players.map(
        ({ playerId, username, score, isHost, connected }) => ({
            playerId,
            username,
            score,
            isHost,
            connected,
        })
    ),
});

export {
    bindSocket,
    createRoom,
    joinRoom,
    joinPublicMatchmaking,
    getRoom,
    getPlayerRoom,
    getPlayerBySocket,
    removeSocket,
    leaveRoom,
    getPublicRoomState,
    startGame,
    chooseWord,
    startNextTurn,
    getWinner,
    requestRematch,
    startRematch,
};














































// const rooms = new Map();

// const playerRooms = new Map();

// const socketPlayers = new Map();



// const MIN_PLAYERS = 2;
// const MAX_PLAYERS = 20;
// const DEFAULT_MAX_PLAYERS = 8;
// const MIN_ROUNDS = 1;
// const MAX_ROUNDS = 10;
// const DEFAULT_ROUNDS = 3;
// const MIN_DRAW_TIME = 15;
// const MAX_DRAW_TIME = 240;
// const DEFAULT_DRAW_TIME = 60;
// const MIN_WORD_CHOICES = 1;
// const MAX_WORD_CHOICES = 5;
// const DEFAULT_WORD_CHOICES = 3;
// const MIN_HINTS = 0;
// const MAX_HINTS = 5;
// const DEFAULT_HINTS = 0;





// const WORD_BANK = [

//     "Apple",

//     "Elephant",

//     "Guitar",

//     "Rainbow",

//     "Pizza",

//     "Airplane",

//     "Butterfly",

//     "Castle",

//     "Sunflower",

//     "Rocket",

//     "Mountain",

//     "Penguin",

//     "Ice Cream",

//     "Football",

//     "Turtle",

// ];





// const generateRoomCode = () => {

//     const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

//     let code;



//     do {

//         code = "";



//         for (let i = 0; i < 6; i++) {

//             code += characters[

//                 Math.floor(Math.random() * characters.length)

//             ];

//         }

//     } while (rooms.has(code));



//     return code;

// };





// const shufflePlayers = (players) => {

//     const shuffled = [...players];



//     for (let i = shuffled.length - 1; i > 0; i--) {

//         const j = Math.floor(Math.random() * (i + 1));



//         [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];

//     }



//     return shuffled.map((player) => player.playerId);

// };





// const validateUsername = (username) => {

//     if (typeof username !== "string") {

//         throw new Error("Username is required");

//     }



//     const cleanedUsername = username.trim();



//     if (cleanedUsername.length < 2 || cleanedUsername.length > 20) {

//         throw new Error("Username must be 2 to 20 characters");

//     }



//     return cleanedUsername;

// };



// const bindSocket = (playerId, socketId) => {

//     if (typeof playerId !== "string" || playerId.length > 100) {

//         throw new Error("Invalid player ID");

//     }
// // A refreshed player may have a new socket ID.*

//     const oldSocketId = [...socketPlayers.entries()].find(

//         ([, id]) => id === playerId

//     )?.[0];



//     if (oldSocketId) {

//         socketPlayers.delete(oldSocketId);

//     }



//     socketPlayers.set(socketId, playerId);



//     const roomCode = playerRooms.get(playerId);

//     const room = roomCode ? rooms.get(roomCode) : null;



//     if (room) {

//         const player = room.players.find(

//             (item) => item.playerId === playerId

//         );



//         if (player) {

//             player.socketId = socketId;

//             player.connected = true;

//         }

//     }



//     return room ?? null;

// };



// const createRoom = ({ playerId, socketId, username, type = "private" }) => {

//     if (playerRooms.has(playerId)) {

//         throw new Error("You are already in a room");

//     }



//     if (!["private", "public"].includes(type)) {

//         throw new Error("Invalid room type");

//     }



//     const cleanedUsername = validateUsername(username);

//     const roomCode = generateRoomCode();



//     const room = {

//         roomCode,

//         type,

//         players: [

//             {

//                 playerId,

//                 socketId,

//                 username: cleanedUsername,

//                 score: 0,

//                 isHost: true,

//                 connected: true,

//             },

//         ],

//         status: "waiting",

//         currentDrawer: null,

//         round: 0,

//         maxRounds: DEFAULT_ROUNDS,
//         maxPlayers: DEFAULT_MAX_PLAYERS,
//         drawTime: DEFAULT_DRAW_TIME,
//         wordChoiceCount: DEFAULT_WORD_CHOICES,
//         hintCount: DEFAULT_HINTS,

//         drawerOrder: [],

//         drawerIndex: 0,


//         turnEndsAt: null,

//         guessedPlayers: [],

//         roundEndedAt: null,

//         rematchPlayers: [],

//     };



//     rooms.set(roomCode, room);

//     playerRooms.set(playerId, roomCode);

//     socketPlayers.set(socketId, playerId);



//     return room;

// };



// const joinRoom = ({ playerId, socketId, username, roomCode }) => {

//     if (playerRooms.has(playerId)) {

//         throw new Error("You are already in a room");

//     }



//     if (typeof roomCode !== "string") {

//         throw new Error("Room code is required");

//     }



//     const code = roomCode.trim().toUpperCase();

//     const room = rooms.get(code);



//     if (!room) {

//         throw new Error("Room not found");

//     }



//     if (room.type === "public" && room.status !== "waiting") {

//         throw new Error("Game has already started");

//     }



//     if (room.status !== "waiting") {

//         throw new Error("Game has already started");

//     }



//     if (room.players.length >= room.maxPlayers) {

//         throw new Error("Room is full");

//     }



//     const player = {

//         playerId,

//         socketId,

//         username: validateUsername(username),

//         score: 0,

//         isHost: false,

//         connected: true,

//     };



//     room.players.push(player);

//     playerRooms.set(playerId, code);

//     socketPlayers.set(socketId, playerId);



//     return room;

// };



// const joinPublicMatchmaking = ({ playerId, socketId, username }) => {

//     const room = [...rooms.values()].find(

//         (item) =>

//             item.type === "public" &&

//             item.status === "waiting" &&

//             item.players.length < item.maxPlayers

//     );



//     if (!room) {

//         return createRoom({

//             playerId,

//             socketId,

//             username,

//             type: "public",

//         });

//     }



//     return joinRoom({

//         playerId,

//         socketId,

//         username,

//         roomCode: room.roomCode,

//     });

// };





// const startGame = (playerId, selectedSettings = {}) => {
//   const room = getPlayerRoom(playerId);
//   if (!room) throw new Error("Room not found");

//   const host = room.players.find((player) => player.playerId === playerId);
//   if (!host?.isHost) throw new Error("Only the host can start the game");
//   if (room.status !== "waiting") throw new Error("Game has already started");

//   const connectedPlayers = room.players.filter((player) => player.connected);
//   if (connectedPlayers.length < 2) throw new Error("At least 2 connected players are required");

//   const {
//     maxPlayers = room.maxPlayers,
//     rounds = room.maxRounds,
//     drawTime = room.drawTime,
//     wordChoiceCount = room.wordChoiceCount,
//     hintCount = room.hintCount,
//   } = selectedSettings;
//   const settings = {
//     maxPlayers: Number(maxPlayers), rounds: Number(rounds),
//     drawTime: Number(drawTime), wordChoiceCount: Number(wordChoiceCount),
//     hintCount: Number(hintCount),
//   };
//   if (!Number.isInteger(settings.maxPlayers) || settings.maxPlayers < MIN_PLAYERS || settings.maxPlayers > MAX_PLAYERS) throw new Error(`Maximum players must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
//   if (!Number.isInteger(settings.rounds) || settings.rounds < MIN_ROUNDS || settings.rounds > MAX_ROUNDS) throw new Error(`Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}`);
//   if (!Number.isInteger(settings.drawTime) || settings.drawTime < MIN_DRAW_TIME || settings.drawTime > MAX_DRAW_TIME) throw new Error(`Drawing time must be between ${MIN_DRAW_TIME} and ${MAX_DRAW_TIME}`);
//   if (!Number.isInteger(settings.wordChoiceCount) || settings.wordChoiceCount < MIN_WORD_CHOICES || settings.wordChoiceCount > MAX_WORD_CHOICES) throw new Error(`Word choices must be between ${MIN_WORD_CHOICES} and ${MAX_WORD_CHOICES}`);
//   if (!Number.isInteger(settings.hintCount) || settings.hintCount < MIN_HINTS || settings.hintCount > MAX_HINTS) throw new Error(`Hints must be between ${MIN_HINTS} and ${MAX_HINTS}`);
//   if (room.players.length > settings.maxPlayers) throw new Error("Maximum players cannot be less than the current number of players");

//   room.maxPlayers = settings.maxPlayers;
//   room.maxRounds = settings.rounds;
//   room.drawTime = settings.drawTime;
//   room.wordChoiceCount = settings.wordChoiceCount;
//   room.hintCount = settings.hintCount;
//   room.drawerOrder = shufflePlayers(connectedPlayers);
//   room.drawerIndex = 0;
//   const drawer = connectedPlayers.find((player) => player.playerId === room.drawerOrder[0]);
//   const shuffledWords = [...WORD_BANK].sort(() => Math.random() - 0.5);
//   room.status = "choosing";
//   room.currentDrawer = drawer.playerId;
//   room.round = 1;
//   room.secretWord = null;
//   room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);
//   room.scoreHistory = [];
//   room.guessedPlayers = [];
//   room.hintsRevealed = 0;
//   room.turnEndsAt = null;
//   room.roundEndedAt = null;
//   return { room, drawer, choices: [...room.wordChoices] };
// };

// const chooseWord = ({ playerId, word }) => {

//     const room = getPlayerRoom(playerId);



//     if (!room) {

//         throw new Error("Room not found");

//     }



//     if (room.status !== "choosing") {

//         throw new Error("Word selection is not active");

//     }



//     if (room.currentDrawer !== playerId) {

//         throw new Error("Only the current drawer can choose a word");

//     }



//     if (!room.wordChoices?.includes(word)) {

//         throw new Error("Invalid word choice");

//     }



//     room.secretWord = word;

//     room.wordChoices = [];

//     room.status = "drawing";



//     room.turnEndsAt = Date.now() + 60 * 1000;



//     return room;

// };



// const startNextTurn = (roomCode) => {

//     const room = rooms.get(roomCode);



//     if (!room) {

//         throw new Error("Room not found");

//     }



//     const connectedPlayers = room.players.filter(

//         (player) => player.connected

//     );



//     if (connectedPlayers.length < 2) {

//         room.status = "finished";

//         room.currentDrawer = null;

//         room.turnEndsAt = null;

//         room.secretWord = null;

//         room.wordChoices = [];

//         room.roundEndedAt = Date.now();



//         return { room, drawer: null, choices: [] };

//     }
// // Find the next connected player in the current cycle.*

//     let nextIndex = -1;



//     for (

//         let i = room.drawerIndex + 1;

//         i < room.drawerOrder.length;

//         i++

//     ) {

//         const player = connectedPlayers.find(

//             (item) => item.playerId === room.drawerOrder[i]

//         );



//         if (player) {

//             nextIndex = i;

//             break;

//         }

//     }
// // Current cycle is complete.*

//     if (nextIndex === -1) {
// // All selected cycles are complete.*

//         if (room.round >= room.maxRounds) {

//             room.status = "finished";

//             room.currentDrawer = null;

//             room.turnEndsAt = null;

//             room.secretWord = null;

//             room.wordChoices = [];

//             room.roundEndedAt = Date.now();



//             return { room, drawer: null, choices: [] };

//         }
// // Begin the next cycle with a fresh player order.*

//         room.round += 1;

//         room.drawerOrder = shufflePlayers(connectedPlayers);

//         room.drawerIndex = 0;

//     } else {
// // Continue the current cycle.*

//         room.drawerIndex = nextIndex;

//     }



//     const drawerId = room.drawerOrder[room.drawerIndex];



//     const drawer = connectedPlayers.find(

//         (player) => player.playerId === drawerId

//     );



//     const shuffledWords = [...WORD_BANK].sort(

//         () => Math.random() - 0.5

//     );



//     room.status = "choosing";

//     room.currentDrawer = drawer.playerId;

//     room.secretWord = null;

//     room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);

//     room.turnEndsAt = null;

//     room.guessedPlayers = [];

//     room.roundEndedAt = null;



//     return {

//         room,

//         drawer,

//         choices: [...room.wordChoices],

//     };

// };







// const getRoom = (roomCode) => rooms.get(roomCode) ?? null;



// const requestRematch = (playerId) => {

//     const room = getPlayerRoom(playerId);



//     if (!room) {

//         throw new Error("Room not found");

//     }



//     if (room.status !== "finished") {

//         throw new Error("The current game is not finished");

//     }



//     const player = room.players.find(

//         (item) => item.playerId === playerId

//     );



//     if (!player || !player.connected) {

//         throw new Error("Player is not connected");

//     }
// // Add the player only once*

//     if (!room.rematchPlayers.includes(playerId)) {

//         room.rematchPlayers.push(playerId);

//     }



//     return room;

// };





// const startRematch = (playerId) => {

//     const room = getPlayerRoom(playerId);



//     if (!room) {

//         throw new Error("Room not found");

//     }



//     const host = room.players.find(

//         (player) => player.playerId === playerId

//     );



//     if (!host?.isHost) {

//         throw new Error("Only the host can start the rematch");

//     }



//     if (room.status !== "finished") {

//         throw new Error("The current game is not finished");

//     }
// // Only connected players who requested a rematch*

//     const rematchPlayers = room.players.filter(

//         (player) =>

//             player.connected &&

//             room.rematchPlayers.includes(player.playerId)

//     );



//     if (rematchPlayers.length < 2) {

//         throw new Error("At least 2 connected players must be ready");

//     }
// // Identify players who will not join the rematch*

//     const readyIds = new Set(

//         rematchPlayers.map((player) => player.playerId)

//     );



//     const excludedPlayers = room.players.filter(

//         (player) => !readyIds.has(player.playerId)

//     );
// // Remove excluded players from the room mappings*

//     for (const player of excludedPlayers) {

//         playerRooms.delete(player.playerId);



//         if (player.socketId) {

//             socketPlayers.delete(player.socketId);

//         }

//     }
// // Keep only players who joined the rematch*

//     room.players = rematchPlayers.map((player) => ({

//         ...player,

//         score: 0,

//         isHost: player.playerId === host.playerId,

//     }));
// // Reset game state*

//     room.status = "choosing";

//     room.round = 1;

//     room.currentDrawer = null;

//     room.secretWord = null;

//     room.wordChoices = [];

//     room.turnEndsAt = null;

//     room.guessedPlayers = [];

//     room.roundEndedAt = null;

//     room.scoreHistory = [];

//     room.rematchPlayers = [];





// room.drawerOrder = shufflePlayers(

//     room.players.filter((player) => player.connected)

// );

// room.drawerIndex = 0;



// const drawer = room.players.find(

//     (player) => player.playerId === room.drawerOrder[0]

// );





//     const shuffledWords = [...WORD_BANK].sort(

//         () => Math.random() - 0.5

//     );



//     room.currentDrawer = drawer.playerId;

//     room.wordChoices = shuffledWords.slice(0, room.wordChoiceCount);



//     return {

//         room,

//         drawer,

//         choices: [...room.wordChoices],

//         excludedPlayers,

//     };

// };





// const getWinner = (room) => {

//     if (!room.players.length) {

//         return null;

//     }
// // Find the highest final score*

//     const highestScore = Math.max(

//         ...room.players.map((player) => player.score)

//     );



//     const topPlayers = room.players.filter(

//         (player) => player.score === highestScore

//     );
// // No tie: return the highest-scoring player*

//     if (topPlayers.length === 1) {

//         return topPlayers[0];

//     }
// // Tie: find who reached the final score first*

//     const history = room.scoreHistory || [];



//     topPlayers.sort((a, b) => {

//         const aIndex = history.findIndex(

//             (entry) =>

//                 entry.playerId === a.playerId &&

//                 entry.score >= highestScore

//         );



//         const bIndex = history.findIndex(

//             (entry) =>

//                 entry.playerId === b.playerId &&

//                 entry.score >= highestScore

//         );



//         const aOrder = aIndex === -1 ? Infinity : aIndex;

//         const bOrder = bIndex === -1 ? Infinity : bIndex;



//         return aOrder - bOrder;

//     });



//     return topPlayers[0];

// };



// const getPlayerRoom = (playerId) => {

//     const roomCode = playerRooms.get(playerId);

//     return roomCode ? getRoom(roomCode) : null;

// };



// const getPlayerBySocket = (socketId) => {

//     const playerId = socketPlayers.get(socketId);



//     if (!playerId) return null;



//     const room = getPlayerRoom(playerId);



//     if (!room) return null;



//     const player = room.players.find(

//         (item) => item.playerId === playerId

//     );



//     return player ? { player, room } : null;

// };



// const removeSocket = (socketId) => {

//     const playerId = socketPlayers.get(socketId);



//     if (!playerId) return null;



//     socketPlayers.delete(socketId);



//     const room = getPlayerRoom(playerId);



//     if (!room) return null;



//     const player = room.players.find(

//         (item) => item.playerId === playerId

//     );
// // Keep the player and room so a refresh can reconnect.*

//     if (player && player.socketId === socketId) {

//         player.connected = false;

//     }



//     return room;

// };





// const leaveRoom = (playerId) => {

//     const roomCode = playerRooms.get(playerId);

//     const room = roomCode ? rooms.get(roomCode) : null;



//     if (!room) {

//         playerRooms.delete(playerId);

//         return { roomCode, room: null };

//     }



//     const player = room.players.find(

//         (item) => item.playerId === playerId

//     );



//     if (player?.socketId) {

//         socketPlayers.delete(player.socketId);

//     }



//     room.players = room.players.filter(

//         (item) => item.playerId !== playerId

//     );



//     playerRooms.delete(playerId);

//     if (Array.isArray(room.rematchPlayers)) {

//     room.rematchPlayers = room.rematchPlayers.filter(

//         (id) => id !== playerId

//     );

// }



//     if (room.players.length === 0) {

//         rooms.delete(roomCode);

//         return { roomCode, room: null };

//     }
// // If an active game has fewer than 2 players, close the room.*

//     const gameIsActive = [

//         "choosing",

//         "drawing",

//         "round-ended",

//     ].includes(room.status);



//     if (gameIsActive && room.players.length < 2) {

//         for (const remainingPlayer of room.players) {

//             playerRooms.delete(remainingPlayer.playerId);



//             if (remainingPlayer.socketId) {

//                 socketPlayers.delete(remainingPlayer.socketId);

//             }

//         }



//         rooms.delete(roomCode);



//         return { roomCode, room: null };

//     }
// // Transfer host if the previous host left.*

//     if (!room.players.some((item) => item.isHost)) {

//         const newHost = room.players.find(

//             (item) => item.connected

//         );



//         if (newHost) {

//             newHost.isHost = true;

//         }

//     }



//     return { roomCode, room };

// };
// // Never send internal socket IDs to other players.*

// const getPublicRoomState = (room) => ({

//     roomCode: room.roomCode,

//     type: room.type,

//     status: room.status,

//     currentDrawer: room.currentDrawer,

//     round: room.round,

//     maxRounds: room.maxRounds,

//     maxPlayers: room.maxPlayers,

//     drawTime: room.drawTime,

//     wordChoiceCount: room.wordChoiceCount,

//     hintCount: room.hintCount,

//     turnEndsAt: room.turnEndsAt,

//     players: room.players.map(

//         ({ playerId, username, score, isHost, connected }) => ({

//             playerId,

//             username,

//             score,

//             isHost,

//             connected,

//         })

//     ),

// });



// export {

//     bindSocket,

//     createRoom,

//     joinRoom,

//     joinPublicMatchmaking,

//     getRoom,

//     getPlayerRoom,

//     getPlayerBySocket,

//     removeSocket,

//     leaveRoom,

//     getPublicRoomState,

//     startGame,

//     chooseWord,

//     startNextTurn,

//     getWinner,

//     requestRematch,

// startRematch,

// };
