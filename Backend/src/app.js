import express, { urlencoded } from "express"
import dotenv from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"
import path from "path"

dotenv.config({
    path: "./.env"
})

const app = express();

const _dirname = path.resolve();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true
    })
)
app.use(express.json());
app.use(urlencoded({extended:true}));
app.use(express.static("public"));
app.use(cookieParser());

app.use(express.static(path.join(_dirname, "/Frontend/dist")))
app.get('/{*splat}', (_, res) => {
    res.sendFile(
        path.resolve(_dirname, "Frontend", "dist", "index.html")
    )
})
export { app }