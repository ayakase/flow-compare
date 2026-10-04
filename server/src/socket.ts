import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";

export interface FlowLogEvent {
  flow: "langchain" | "raw" | "raw-aisdk" | "aisdk" | "mastra" | (string & {});
  type: "info" | "llm" | "tool_call" | "tool_result" | "final" | "error";
  message: string;
  data?: any;
  timestamp: string;
}

export type LogEmitter = (log: Omit<FlowLogEvent, "timestamp">) => void;

let ioInstance: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  ioInstance.on("connection", (socket) => {
    console.log(`🔌 [Socket.io] Client connected: ${socket.id}`);

    socket.on("join", (sessionId: string) => {
      socket.join(sessionId);
    });

    socket.on("disconnect", () => {
      console.log(`🔌 [Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function createEmitter(sessionId?: string): LogEmitter {
  return (event) => {
    const payload: FlowLogEvent = {
      ...event,
      timestamp: new Date().toLocaleTimeString(),
    };

    if (ioInstance) {
      if (sessionId) {
        ioInstance.to(sessionId).emit("flow:log", payload);
      } else {
        ioInstance.emit("flow:log", payload);
      }
    }
  };
}
