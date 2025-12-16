import express from "express";
import dotenv from "dotenv";
dotenv.config();


import cors from "cors";
import mongoose from "mongoose";
import eventRoutes from "./routes/eventRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import path from "path";






const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "https://rangrez-events-front-end.vercel.app",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

app.use("/api/events", eventRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", bookingRoutes);

const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));




// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Default route
app.get("/", (req, res) => {
    res.send("Backend is running...");
});

// Listen
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
