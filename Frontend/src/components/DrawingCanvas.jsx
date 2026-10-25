import { useRef, useState, useEffect } from "react";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;

// How different a pixel may be from the clicked pixel and still get filled.
// A little tolerance covers the anti-aliased edges of brush strokes.
const FILL_TOLERANCE = 40;

// Maximum number of undo steps kept in memory (each snapshot is ~1.8 MB).
const MAX_UNDO_HISTORY = 50;

function pushHistory(historyRef, ctx, canvas) {
  historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

  if (historyRef.current.length > MAX_UNDO_HISTORY) {
    historyRef.current.shift();
  }
}

/* -------------------------------------------------------------------------- */
/* Flood fill (paint bucket)                                                  */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function floodFill(ctx, startX, startY, fillColor, tolerance = FILL_TOLERANCE) {
  const { width, height } = ctx.canvas;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);

  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const startIndex = (y0 * width + x0) * 4;
  const target = [
    data[startIndex],
    data[startIndex + 1],
    data[startIndex + 2],
    data[startIndex + 3],
  ];
  const [fillR, fillG, fillB] = hexToRgb(fillColor);

  const matchesTarget = (i) =>
    Math.abs(data[i] - target[0]) <= tolerance &&
    Math.abs(data[i + 1] - target[1]) <= tolerance &&
    Math.abs(data[i + 2] - target[2]) <= tolerance &&
    Math.abs(data[i + 3] - target[3]) <= tolerance;

  const visited = new Uint8Array(width * height);
  const stack = [y0 * width + x0];
  visited[y0 * width + x0] = 1;

  while (stack.length > 0) {
    const pixel = stack.pop();
    const x = pixel % width;
    const y = (pixel - x) / width;
    const i = pixel * 4;

    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = 255;

    if (x > 0 && !visited[pixel - 1] && matchesTarget(i - 4)) {
      visited[pixel - 1] = 1;
      stack.push(pixel - 1);
    }
    if (x < width - 1 && !visited[pixel + 1] && matchesTarget(i + 4)) {
      visited[pixel + 1] = 1;
      stack.push(pixel + 1);
    }
    if (y > 0 && !visited[pixel - width] && matchesTarget(i - width * 4)) {
      visited[pixel - width] = 1;
      stack.push(pixel - width);
    }
    if (y < height - 1 && !visited[pixel + width] && matchesTarget(i + width * 4)) {
      visited[pixel + width] = 1;
      stack.push(pixel + width);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DrawingCanvas({ socket, isDrawer = false }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const historyRef = useRef([]);

  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(5);
  const [tool, setTool] = useState("brush"); // "brush" | "bucket"

  /* ----- Local drawing helpers ----- */

  const getCanvasPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (event) => {
    if (!isDrawer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCanvasPosition(event);

    // Paint bucket: fill the area under the pointer and stop.
    if (tool === "bucket") {
      pushHistory(historyRef, ctx, canvas);
      floodFill(ctx, x, y, color);
      socket?.emit("drawing:fill", { x, y, color });
      return;
    }

    isDrawing.current = true;
    canvas.setPointerCapture(event.pointerId);

    pushHistory(historyRef, ctx, canvas);

    ctx.beginPath();
    ctx.moveTo(x, y);

    socket?.emit("drawing:start", { x, y, color, brushSize });
  };

  const draw = (event) => {
    if (!isDrawer || !isDrawing.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCanvasPosition(event);

    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    socket?.emit("drawing:move", { x, y, color, brushSize });
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    if (!isDrawer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];

    socket?.emit("drawing:clear");
  };

  const undoDrawing = () => {
    if (!isDrawer) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx || historyRef.current.length === 0) {
      return;
    }

    const previousState = historyRef.current.pop();

    ctx.putImageData(previousState, 0, 0);

    socket?.emit("drawing:undo");
  };

  const selectEraser = () => {
    setTool("brush");
    setColor("#ffffff");
  };

  /* ----- Remote drawing events ----- */

  useEffect(() => {
    if (!socket) return;

    const getContext = () => canvasRef.current?.getContext("2d");

    const handleStart = ({ x, y, color, brushSize }) => {
      const ctx = getContext();
      if (!ctx) return;

      const canvas = canvasRef.current;

      if (canvas) {
        pushHistory(historyRef, ctx, canvas);
      }

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    const handleMove = ({ x, y, color, brushSize }) => {
      const ctx = getContext();
      if (!ctx) return;

      ctx.lineTo(x, y);
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    };

    const handleFill = ({ x, y, color }) => {
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (!canvas || !ctx) return;

      pushHistory(historyRef, ctx, canvas);
      floodFill(ctx, x, y, color);
    };

    const handleUndo = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");

      if (!canvas || !ctx || historyRef.current.length === 0) {
        return;
      }

      const previousState = historyRef.current.pop();

      ctx.putImageData(previousState, 0, 0);
    };

    const handleClear = () => {
      const canvas = canvasRef.current;
      const ctx = getContext();

      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        historyRef.current = [];
      }
    };

    // Replays the drawing stored on the server (late joiners and reconnects).
    const handleSync = ({ events = [] } = {}) => {
      const canvas = canvasRef.current;
      const ctx = getContext();

      // Never wipe a stroke the drawer is in the middle of.
      if (!canvas || !ctx || isDrawing.current) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];

      for (const event of events) {
        if (event.type === "start") handleStart(event);
        else if (event.type === "move") handleMove(event);
        else if (event.type === "fill") handleFill(event);
      }
    };

    socket.on("drawing:start", handleStart);
    socket.on("drawing:sync", handleSync);
    socket.on("drawing:move", handleMove);
    socket.on("drawing:fill", handleFill);
    socket.on("drawing:clear", handleClear);
    socket.on("drawing:undo", handleUndo);

    // Ask the server for the current drawing as soon as the board appears.
    socket.emit("drawing:sync-request");

    return () => {
      socket.off("drawing:start", handleStart);
      socket.off("drawing:move", handleMove);
      socket.off("drawing:fill", handleFill);
      socket.off("drawing:clear", handleClear);
      socket.off("drawing:undo", handleUndo);
      socket.off("drawing:sync", handleSync);
    };
  }, [socket]);

  /* ----- Render ----- */

  const toolButtonClass = (active) =>
    `rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition ${
      active
        ? "border-blue-500 bg-blue-500 text-white"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
    }`;

  // The toolbar is only shown to the drawer; guessers just see the board.
  return (
    <div className="w-full overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg">
      {isDrawer && (
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            Color
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border-2 border-slate-200 bg-white p-0.5"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            Brush
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="accent-blue-500"
            />
            <span className="w-10 text-slate-500">{brushSize}px</span>
          </label>

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => setTool("brush")}
              className={toolButtonClass(tool === "brush")}
              title="Brush"
            >
              ✏️ Brush
            </button>

            <button
              onClick={() => setTool("bucket")}
              className={toolButtonClass(tool === "bucket")}
              title="Paint bucket: fill an area with the selected color"
            >
              🪣 Fill
            </button>

            <button
              onClick={selectEraser}
              className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              🧽 Eraser
            </button>

            <button
              onClick={undoDrawing}
              disabled={!isDrawer}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-[0_3px_0_0_#d97706] transition hover:bg-amber-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↶ Undo
            </button>

            <button
              onClick={clearCanvas}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white shadow-[0_3px_0_0_#be123c] transition hover:bg-rose-400 active:translate-y-0.5"
            >
              🗑️ Clear
            </button>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        className="block w-full bg-white"
        style={{
          touchAction: "none",
          cursor: !isDrawer ? "default" : tool === "bucket" ? "cell" : "crosshair",
        }}
      />
    </div>
  );
}





























// import { useRef, useState, useEffect } from "react";

// const CANVAS_WIDTH = 900;
// const CANVAS_HEIGHT = 500;

// // How different a pixel may be from the clicked pixel and still get filled.
// // A little tolerance covers the anti-aliased edges of brush strokes.
// const FILL_TOLERANCE = 40;

// /* -------------------------------------------------------------------------- */
// /* Flood fill (paint bucket)                                                  */
// /* -------------------------------------------------------------------------- */

// function hexToRgb(hex) {
//   const value = parseInt(hex.replace("#", ""), 16);
//   return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
// }

// function floodFill(ctx, startX, startY, fillColor, tolerance = FILL_TOLERANCE) {
//   const { width, height } = ctx.canvas;
//   const x0 = Math.floor(startX);
//   const y0 = Math.floor(startY);

//   if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;

//   const imageData = ctx.getImageData(0, 0, width, height);
//   const data = imageData.data;

//   const startIndex = (y0 * width + x0) * 4;
//   const target = [
//     data[startIndex],
//     data[startIndex + 1],
//     data[startIndex + 2],
//     data[startIndex + 3],
//   ];
//   const [fillR, fillG, fillB] = hexToRgb(fillColor);

//   const matchesTarget = (i) =>
//     Math.abs(data[i] - target[0]) <= tolerance &&
//     Math.abs(data[i + 1] - target[1]) <= tolerance &&
//     Math.abs(data[i + 2] - target[2]) <= tolerance &&
//     Math.abs(data[i + 3] - target[3]) <= tolerance;

//   const visited = new Uint8Array(width * height);
//   const stack = [y0 * width + x0];
//   visited[y0 * width + x0] = 1;

//   while (stack.length > 0) {
//     const pixel = stack.pop();
//     const x = pixel % width;
//     const y = (pixel - x) / width;
//     const i = pixel * 4;

//     data[i] = fillR;
//     data[i + 1] = fillG;
//     data[i + 2] = fillB;
//     data[i + 3] = 255;

//     if (x > 0 && !visited[pixel - 1] && matchesTarget(i - 4)) {
//       visited[pixel - 1] = 1;
//       stack.push(pixel - 1);
//     }
//     if (x < width - 1 && !visited[pixel + 1] && matchesTarget(i + 4)) {
//       visited[pixel + 1] = 1;
//       stack.push(pixel + 1);
//     }
//     if (y > 0 && !visited[pixel - width] && matchesTarget(i - width * 4)) {
//       visited[pixel - width] = 1;
//       stack.push(pixel - width);
//     }
//     if (y < height - 1 && !visited[pixel + width] && matchesTarget(i + width * 4)) {
//       visited[pixel + width] = 1;
//       stack.push(pixel + width);
//     }
//   }

//   ctx.putImageData(imageData, 0, 0);
// }

// /* -------------------------------------------------------------------------- */
// /* Component                                                                  */
// /* -------------------------------------------------------------------------- */

// export default function DrawingCanvas({ socket, isDrawer = false }) {
//   const canvasRef = useRef(null);
//   const isDrawing = useRef(false);
//   const historyRef = useRef([]);

//   const [color, setColor] = useState("#111827");
//   const [brushSize, setBrushSize] = useState(5);
//   const [tool, setTool] = useState("brush"); // "brush" | "bucket"

//   /* ----- Local drawing helpers ----- */

//   const getCanvasPosition = (event) => {
//     const canvas = canvasRef.current;
//     const rect = canvas.getBoundingClientRect();

//     const scaleX = canvas.width / rect.width;
//     const scaleY = canvas.height / rect.height;

//     return {
//       x: (event.clientX - rect.left) * scaleX,
//       y: (event.clientY - rect.top) * scaleY,
//     };
//   };

//   const startDrawing = (event) => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     const { x, y } = getCanvasPosition(event);

//     // Paint bucket: fill the area under the pointer and stop.
//     if (tool === "bucket") {
//       historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       floodFill(ctx, x, y, color);
//       socket?.emit("drawing:fill", { x, y, color });
//       return;
//     }

//     isDrawing.current = true;
//     canvas.setPointerCapture(event.pointerId);

//     historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

//     ctx.beginPath();
//     ctx.moveTo(x, y);

//     socket?.emit("drawing:start", { x, y, color, brushSize });
//   };

//   const draw = (event) => {
//     if (!isDrawer || !isDrawing.current) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     const { x, y } = getCanvasPosition(event);

//     ctx.lineTo(x, y);
//     ctx.strokeStyle = color;
//     ctx.lineWidth = brushSize;
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";
//     ctx.stroke();

//     socket?.emit("drawing:move", { x, y, color, brushSize });
//   };

//   const stopDrawing = () => {
//     isDrawing.current = false;
//   };

//   const clearCanvas = () => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     historyRef.current = [];

//     socket?.emit("drawing:clear");
//   };

//   const undoDrawing = () => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas?.getContext("2d");

//     if (!canvas || !ctx || historyRef.current.length === 0) {
//       return;
//     }

//     const previousState = historyRef.current.pop();

//     ctx.putImageData(previousState, 0, 0);

//     socket?.emit("drawing:undo");
//   };

//   const selectEraser = () => {
//     setTool("brush");
//     setColor("#ffffff");
//   };

//   /* ----- Remote drawing events ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const getContext = () => canvasRef.current?.getContext("2d");

//     const handleStart = ({ x, y, color, brushSize }) => {
//       const ctx = getContext();
//       if (!ctx) return;

//       const canvas = canvasRef.current;

//       if (canvas) {
//         historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       }

//       ctx.beginPath();
//       ctx.moveTo(x, y);
//       ctx.strokeStyle = color;
//       ctx.lineWidth = brushSize;
//       ctx.lineCap = "round";
//       ctx.lineJoin = "round";
//     };

//     const handleMove = ({ x, y, color, brushSize }) => {
//       const ctx = getContext();
//       if (!ctx) return;

//       ctx.lineTo(x, y);
//       ctx.strokeStyle = color;
//       ctx.lineWidth = brushSize;
//       ctx.lineCap = "round";
//       ctx.lineJoin = "round";
//       ctx.stroke();
//     };

//     const handleFill = ({ x, y, color }) => {
//       const canvas = canvasRef.current;
//       const ctx = getContext();
//       if (!canvas || !ctx) return;

//       historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       floodFill(ctx, x, y, color);
//     };

//     const handleUndo = () => {
//       const canvas = canvasRef.current;
//       const ctx = canvas?.getContext("2d");

//       if (!canvas || !ctx || historyRef.current.length === 0) {
//         return;
//       }

//       const previousState = historyRef.current.pop();

//       ctx.putImageData(previousState, 0, 0);
//     };

//     const handleClear = () => {
//       const canvas = canvasRef.current;
//       const ctx = getContext();

//       if (canvas && ctx) {
//         ctx.clearRect(0, 0, canvas.width, canvas.height);
//         historyRef.current = [];
//       }
//     };

//     socket.on("drawing:start", handleStart);
//     socket.on("drawing:move", handleMove);
//     socket.on("drawing:fill", handleFill);
//     socket.on("drawing:clear", handleClear);
//     socket.on("drawing:undo", handleUndo);

//     return () => {
//       socket.off("drawing:start", handleStart);
//       socket.off("drawing:move", handleMove);
//       socket.off("drawing:fill", handleFill);
//       socket.off("drawing:clear", handleClear);
//       socket.off("drawing:undo", handleUndo);
//     };
//   }, [socket]);

//   /* ----- Render ----- */

//   const toolButtonClass = (active) =>
//     `rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition ${
//       active
//         ? "border-blue-500 bg-blue-500 text-white"
//         : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
//     }`;

//   // The toolbar is only shown to the drawer; guessers just see the board.
//   return (
//     <div className="w-full overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg">
//       {isDrawer && (
//         <div className="flex flex-wrap items-center gap-3 border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//           <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
//             Color
//             <input
//               type="color"
//               value={color}
//               onChange={(event) => setColor(event.target.value)}
//               className="h-9 w-12 cursor-pointer rounded-lg border-2 border-slate-200 bg-white p-0.5"
//             />
//           </label>

//           <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
//             Brush
//             <input
//               type="range"
//               min="1"
//               max="20"
//               value={brushSize}
//               onChange={(event) => setBrushSize(Number(event.target.value))}
//               className="accent-blue-500"
//             />
//             <span className="w-10 text-slate-500">{brushSize}px</span>
//           </label>

//           <div className="ml-auto flex flex-wrap gap-2">
//             <button
//               onClick={() => setTool("brush")}
//               className={toolButtonClass(tool === "brush")}
//               title="Brush"
//             >
//               ✏️ Brush
//             </button>

//             <button
//               onClick={() => setTool("bucket")}
//               className={toolButtonClass(tool === "bucket")}
//               title="Paint bucket: fill an area with the selected color"
//             >
//               🪣 Fill
//             </button>

//             <button
//               onClick={selectEraser}
//               className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
//             >
//               🧽 Eraser
//             </button>

//             <button
//               onClick={undoDrawing}
//               disabled={!isDrawer}
//               className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-[0_3px_0_0_#d97706] transition hover:bg-amber-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
//             >
//               ↶ Undo
//             </button>

//             <button
//               onClick={clearCanvas}
//               className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white shadow-[0_3px_0_0_#be123c] transition hover:bg-rose-400 active:translate-y-0.5"
//             >
//               🗑️ Clear
//             </button>
//           </div>
//         </div>
//       )}

//       <canvas
//         ref={canvasRef}
//         width={CANVAS_WIDTH}
//         height={CANVAS_HEIGHT}
//         onPointerDown={startDrawing}
//         onPointerMove={draw}
//         onPointerUp={stopDrawing}
//         onPointerLeave={stopDrawing}
//         className="block w-full bg-white"
//         style={{
//           touchAction: "none",
//           cursor: !isDrawer ? "default" : tool === "bucket" ? "cell" : "crosshair",
//         }}
//       />
//     </div>
//   );
// }






















// import { useRef, useState, useEffect } from "react";

// const CANVAS_WIDTH = 900;
// const CANVAS_HEIGHT = 500;

// export default function DrawingCanvas({ socket, isDrawer = false }) {
//   const canvasRef = useRef(null);
//   const isDrawing = useRef(false);
//   const historyRef = useRef([]);

//   const [color, setColor] = useState("#111827");
//   const [brushSize, setBrushSize] = useState(5);

//   /* ----- Local drawing helpers ----- */

//   const getCanvasPosition = (event) => {
//     const canvas = canvasRef.current;
//     const rect = canvas.getBoundingClientRect();

//     const scaleX = canvas.width / rect.width;
//     const scaleY = canvas.height / rect.height;

//     return {
//       x: (event.clientX - rect.left) * scaleX,
//       y: (event.clientY - rect.top) * scaleY,
//     };
//   };

//   const startDrawing = (event) => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     const { x, y } = getCanvasPosition(event);

//     isDrawing.current = true;
//     canvas.setPointerCapture(event.pointerId);

//     historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

//     ctx.beginPath();
//     ctx.moveTo(x, y);

//     socket?.emit("drawing:start", { x, y, color, brushSize });
//   };

//   const draw = (event) => {
//     if (!isDrawer || !isDrawing.current) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     const { x, y } = getCanvasPosition(event);

//     ctx.lineTo(x, y);
//     ctx.strokeStyle = color;
//     ctx.lineWidth = brushSize;
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";
//     ctx.stroke();

//     socket?.emit("drawing:move", { x, y, color, brushSize });
//   };

//   const stopDrawing = () => {
//     isDrawing.current = false;
//   };

//   const clearCanvas = () => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     historyRef.current = [];

//     socket?.emit("drawing:clear");
//   };

//   const undoDrawing = () => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas?.getContext("2d");

//     if (!canvas || !ctx || historyRef.current.length === 0) {
//       return;
//     }

//     const previousState = historyRef.current.pop();

//     ctx.putImageData(previousState, 0, 0);

//     socket?.emit("drawing:undo");
//   };

//   /* ----- Remote drawing events ----- */

//   useEffect(() => {
//     if (!socket) return;

//     const getContext = () => canvasRef.current?.getContext("2d");

//     const handleStart = ({ x, y, color, brushSize }) => {
//       const ctx = getContext();
//       if (!ctx) return;

//       const canvas = canvasRef.current;

//       if (canvas) {
//         historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       }

//       ctx.beginPath();
//       ctx.moveTo(x, y);
//       ctx.strokeStyle = color;
//       ctx.lineWidth = brushSize;
//       ctx.lineCap = "round";
//       ctx.lineJoin = "round";
//     };

//     const handleMove = ({ x, y, color, brushSize }) => {
//       const ctx = getContext();
//       if (!ctx) return;

//       ctx.lineTo(x, y);
//       ctx.strokeStyle = color;
//       ctx.lineWidth = brushSize;
//       ctx.lineCap = "round";
//       ctx.lineJoin = "round";
//       ctx.stroke();
//     };

//     const handleUndo = () => {
//       const canvas = canvasRef.current;
//       const ctx = canvas?.getContext("2d");

//       if (!canvas || !ctx || historyRef.current.length === 0) {
//         return;
//       }

//       const previousState = historyRef.current.pop();

//       ctx.putImageData(previousState, 0, 0);
//     };

//     const handleClear = () => {
//       const canvas = canvasRef.current;
//       const ctx = getContext();

//       if (canvas && ctx) {
//         ctx.clearRect(0, 0, canvas.width, canvas.height);
//         historyRef.current = [];
//       }
//     };

//     socket.on("drawing:start", handleStart);
//     socket.on("drawing:move", handleMove);
//     socket.on("drawing:clear", handleClear);
//     socket.on("drawing:undo", handleUndo);

//     return () => {
//       socket.off("drawing:start", handleStart);
//       socket.off("drawing:move", handleMove);
//       socket.off("drawing:clear", handleClear);
//       socket.off("drawing:undo", handleUndo);
//     };
//   }, [socket]);

//   /* ----- Render ----- */

//   // The toolbar is only shown to the drawer; guessers just see the board.
//   return (
//     <div className="w-full overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg">
//       {isDrawer && (
//         <div className="flex flex-wrap items-center gap-3 border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
//           <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
//             Color
//             <input
//               type="color"
//               value={color}
//               onChange={(event) => setColor(event.target.value)}
//               className="h-9 w-12 cursor-pointer rounded-lg border-2 border-slate-200 bg-white p-0.5"
//             />
//           </label>

//           <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
//             Brush
//             <input
//               type="range"
//               min="1"
//               max="20"
//               value={brushSize}
//               onChange={(event) => setBrushSize(Number(event.target.value))}
//               className="accent-blue-500"
//             />
//             <span className="w-10 text-slate-500">{brushSize}px</span>
//           </label>

//           <div className="ml-auto flex flex-wrap gap-2">
//             <button
//               onClick={() => setColor("#ffffff")}
//               className="rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
//             >
//               🧽 Eraser
//             </button>

//             <button
//               onClick={undoDrawing}
//               disabled={!isDrawer}
//               className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950 shadow-[0_3px_0_0_#d97706] transition hover:bg-amber-300 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
//             >
//               ↶ Undo
//             </button>

//             <button
//               onClick={clearCanvas}
//               className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white shadow-[0_3px_0_0_#be123c] transition hover:bg-rose-400 active:translate-y-0.5"
//             >
//               🗑️ Clear
//             </button>
//           </div>
//         </div>
//       )}

//       <canvas
//         ref={canvasRef}
//         width={CANVAS_WIDTH}
//         height={CANVAS_HEIGHT}
//         onPointerDown={startDrawing}
//         onPointerMove={draw}
//         onPointerUp={stopDrawing}
//         onPointerLeave={stopDrawing}
//         className="block w-full bg-white"
//         style={{ touchAction: "none", cursor: isDrawer ? "crosshair" : "default" }}
//       />
//     </div>
//   );
// }































// import { useRef, useState, useEffect } from "react";

// export default function DrawingCanvas({ socket, isDrawer = false }) {
//   const canvasRef = useRef(null);
//   const isDrawing = useRef(false);
//   const historyRef = useRef([]);

//   const [color, setColor] = useState("#111827");
//   const [brushSize, setBrushSize] = useState(5);

//   const getCanvasPosition = (event) => {
//   const canvas = canvasRef.current;
//   const rect = canvas.getBoundingClientRect();

//   const scaleX = canvas.width / rect.width;
//   const scaleY = canvas.height / rect.height;

//   return {
//     x: (event.clientX - rect.left) * scaleX,
//     y: (event.clientY - rect.top) * scaleY,
//   };
// };

  
// const startDrawing = (event) => {
//     if (!isDrawer) return;
//   const canvas = canvasRef.current;
//   const ctx = canvas.getContext("2d");
//   const { x, y } = getCanvasPosition(event);

//   isDrawing.current = true;
//   canvas.setPointerCapture(event.pointerId);

//   historyRef.current.push(
//     ctx.getImageData(0, 0, canvas.width, canvas.height)
// );
//   ctx.beginPath();
//   ctx.moveTo(x, y);
//   socket?.emit("drawing:start", {
//   x,
//   y,
//   color,
//   brushSize,
// });
// };


 
// const draw = (event) => {
//     if (!isDrawer || !isDrawing.current) return;
//   if (!isDrawing.current) return;

//   const canvas = canvasRef.current;
//   const ctx = canvas.getContext("2d");
//   const { x, y } = getCanvasPosition(event);

//   ctx.lineTo(x, y);
//   ctx.strokeStyle = color;
//   ctx.lineWidth = brushSize;
//   ctx.lineCap = "round";
//   ctx.lineJoin = "round";
//   ctx.stroke();

//   socket?.emit("drawing:move", {
//   x,
//   y,
//   color,
//   brushSize,
// });
// };


//   const stopDrawing = () => {
//     isDrawing.current = false;
//   };

//   const clearCanvas = () => {
//     if (!isDrawer) return;
//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     historyRef.current = [];

//     socket?.emit("drawing:clear");
//   };

//   const undoDrawing = () => {
//     if (!isDrawer) return;

//     const canvas = canvasRef.current;
//     const ctx = canvas?.getContext("2d");

//     if (!canvas || !ctx || historyRef.current.length === 0) {
//         return;
//     }

//     const previousState = historyRef.current.pop();

//     ctx.putImageData(previousState, 0, 0);

//     socket?.emit("drawing:undo");
// };

  
// useEffect(() => {
//   if (!socket) return;

//   const getContext = () => canvasRef.current?.getContext("2d");

//   const handleStart = ({ x, y, color, brushSize }) => {
//     const ctx = getContext();
//     if (!ctx) return;


//     const canvas = canvasRef.current;

// if (canvas) {
//     historyRef.current.push(
//         ctx.getImageData(0, 0, canvas.width, canvas.height)
//     );
// }
//     ctx.beginPath();
//     ctx.moveTo(x, y);
//     ctx.strokeStyle = color;
//     ctx.lineWidth = brushSize;
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";
//   };

//   const handleMove = ({ x, y, color, brushSize }) => {
//     const ctx = getContext();
//     if (!ctx) return;

//     ctx.lineTo(x, y);
//     ctx.strokeStyle = color;
//     ctx.lineWidth = brushSize;
//     ctx.lineCap = "round";
//     ctx.lineJoin = "round";
//     ctx.stroke();
//   };

//   const handleUndo = () => {
//     const canvas = canvasRef.current;
//     const ctx = canvas?.getContext("2d");

//     if (!canvas || !ctx || historyRef.current.length === 0) {
//         return;
//     }

//     const previousState = historyRef.current.pop();

//     ctx.putImageData(previousState, 0, 0);
// };

//   const handleClear = () => {
//     const canvas = canvasRef.current;
//     const ctx = getContext();

//     if (canvas && ctx) {
//       ctx.clearRect(0, 0, canvas.width, canvas.height);
//       historyRef.current = [];
//     }
//   };

//   socket.on("drawing:start", handleStart);
//   socket.on("drawing:move", handleMove);
//   socket.on("drawing:clear", handleClear);
//   socket.on("drawing:undo", handleUndo);

//   return () => {
//     socket.off("drawing:start", handleStart);
//     socket.off("drawing:move", handleMove);
//     socket.off("drawing:clear", handleClear);
//     socket.off("drawing:undo", handleUndo);
//   };
// }, [socket]);


//   return (
//     <div className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-4">
//       <div className="mb-4 flex flex-wrap items-center gap-4">
//         <label className="flex items-center gap-2 text-white">
//           Color
//           <input
//             type="color"
//             value={color}
//             onChange={(event) => setColor(event.target.value)}
//           />
//         </label>

//         <label className="flex items-center gap-2 text-white">
//           Brush
//           <input
//             type="range"
//             min="1"
//             max="20"
//             value={brushSize}
//             onChange={(event) =>
//               setBrushSize(Number(event.target.value))
//             }
//           />
//           <span>{brushSize}px</span>
//         </label>

//         <button
//           onClick={() => setColor("#ffffff")}
//           className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white"
//         >
//           Eraser
//         </button>

//         <button
//     onClick={undoDrawing}
//     disabled={!isDrawer}
//     className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
// >
//     ↶ Undo
// </button>

//         <button
//           onClick={clearCanvas}
//           className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
//         >
//           Clear
//         </button>
//       </div>

//       <canvas
//         ref={canvasRef}
//         width={900}
//         height={500}
//         onPointerDown={startDrawing}
//         onPointerMove={draw}
//         onPointerUp={stopDrawing}
//         onPointerLeave={stopDrawing}
//         className="w-full rounded-xl bg-white"
//         style={{ touchAction: "none", cursor: "crosshair" }}
//       />
//     </div>
//   );
// }












