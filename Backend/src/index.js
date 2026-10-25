
import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket/index.js";





const PORT = process.env.PORT || 3000;
const FRONTEND_URL = "https://skribbl-deploy.onrender.com";

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_URL,
        credentials: true,
    },
});

// Register all game-related socket events.
registerSocketHandlers(io);

connectDB()
    .then(() => {
        httpServer.on("error", (error) => {
            console.error("HTTP server error:", error);
        });

        httpServer.listen(PORT, () => {
            console.log(`Server is running at port: ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed:", error);
    });

export { app, io };
