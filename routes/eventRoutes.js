import express from "express";
import multer from "multer";
import Event from "../models/Event.js";
import { authAdmin } from "../middleware/adminMiddleware.js";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const router = express.Router();

// -----------------------------
// CLOUDINARY CONFIG
// -----------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// -----------------------------
// Multer setup (memory storage for Cloudinary)
// -----------------------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// -----------------------------
// Create Event
// -----------------------------
router.post(
  "/add",
  authAdmin,
  upload.fields([
    { name: "imageUrl", maxCount: 1 },
    { name: "sponsorLogos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        description,
        date,
        location,
        category,
        address,
        standardPrice,
        vipPrice,
        eventTime,
        refreshments,
      } = req.body;

      let imageUrl = "";
      let sponsorLogos = [];

      if (req.files.imageUrl) {
        imageUrl = await uploadToCloudinary(req.files.imageUrl[0].buffer, "events");
      }

      if (req.files.sponsorLogos) {
        for (let file of req.files.sponsorLogos) {
          const url = await uploadToCloudinary(file.buffer, "events/sponsors");
          sponsorLogos.push(url);
        }
      }

      const newEvent = new Event({
        title,
        description,
        date,
        location,
        category,
        address,
        standardPrice,
        vipPrice,
        eventTime,
        refreshments,
        imageUrl,
        sponsorLogos,
      });

      const savedEvent = await newEvent.save();
      res.status(201).json(savedEvent);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create event" });
    }
  }
);

// -----------------------------
// Get all events
// -----------------------------
router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

// -----------------------------
// Get single event by ID
// -----------------------------
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/))
      return res.status(400).json({ message: "Invalid event ID" });

    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch event" });
  }
});

// -----------------------------
// Update Event
// -----------------------------
router.put(
  "/:id",
  authAdmin,
  upload.fields([
    { name: "imageUrl", maxCount: 1 },
    { name: "sponsorLogos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!id.match(/^[0-9a-fA-F]{24}$/))
        return res.status(400).json({ message: "Invalid event ID" });

      const event = await Event.findById(id);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const {
        title,
        description,
        date,
        location,
        category,
        address,
        standardPrice,
        vipPrice,
        eventTime,
        refreshments,
      } = req.body;

      event.title = title || event.title;
      event.description = description || event.description;
      event.date = date || event.date;
      event.location = location || event.location;
      event.category = category || event.category;
      event.address = address || event.address;
      event.standardPrice = standardPrice || event.standardPrice;
      event.vipPrice = vipPrice || event.vipPrice;
      event.eventTime = eventTime || event.eventTime;
      event.refreshments = refreshments || event.refreshments;

      if (req.files.imageUrl) {
        event.imageUrl = await uploadToCloudinary(req.files.imageUrl[0].buffer, "events");
      }

      if (req.files.sponsorLogos) {
        let sponsorLogos = [];
        for (let file of req.files.sponsorLogos) {
          const url = await uploadToCloudinary(file.buffer, "events/sponsors");
          sponsorLogos.push(url);
        }
        event.sponsorLogos = sponsorLogos;
      }

      const updatedEvent = await event.save();
      res.json(updatedEvent);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to update event" });
    }
  }
);

// -----------------------------
// Delete Event
// -----------------------------
router.delete("/:id", authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/))
      return res.status(400).json({ message: "Invalid event ID" });

    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    await event.deleteOne();
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

export default router;
