import dotenv from "dotenv";
dotenv.config();  // Required here also

import express from "express";
import multer from "multer";
import Booking from "../models/Booking.js";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

const router = express.Router();

/* ----------------------------------------------------
   CLOUDINARY CONFIG
---------------------------------------------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log("Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("API Key:", process.env.CLOUDINARY_API_KEY);
console.log("API Secret:", process.env.CLOUDINARY_API_SECRET ? "Loaded" : "Missing");


/* ----------------------------------------------------
   MULTER MEMORY STORAGE (REQUIRED FOR VERCEL)
---------------------------------------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ----------------------------------------------------
   HELPER: UPLOAD BUFFER TO CLOUDINARY
---------------------------------------------------- */
const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
};

/* ----------------------------------------------------
   CREATE BOOKING
---------------------------------------------------- */
router.post("/booking/create", upload.single("receiptImage"), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contactNumber,
      emailAddress,
      cityName,
      ticketType,
      eventId,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Receipt image is required" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required" });
    }

    /* -----------------------------------------
       Upload Receipt to Cloudinary
    ----------------------------------------- */
    const uploadResult = await uploadBufferToCloudinary(
      req.file.buffer,
      "receipts"
    );

    /* -----------------------------------------
       Generate Ticket Number
    ----------------------------------------- */
    const ticketNumber = Math.floor(100000 + Math.random() * 900000);

    /* -----------------------------------------
       Save Booking
    ----------------------------------------- */
    const newBooking = new Booking({
      firstName,
      lastName,
      contactNumber,
      emailAddress,
      cityName,
      ticketType,
      eventId,
      ticketNumber,
      receiptImage: uploadResult.secure_url,
    });

    await newBooking.save();

    res.status(201).json({
      message: "Booking created successfully",
      booking: newBooking,
    });
  } catch (error) {
    console.error("Booking Create Error:", error);
    res.status(500).json({ message: "Booking failed", error });
  }
});

/* ----------------------------------------------------
   GET ALL BOOKINGS
---------------------------------------------------- */
router.get("/booking", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("eventId")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

/* ----------------------------------------------------
   GET SINGLE BOOKING
---------------------------------------------------- */
router.get("/booking/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("eventId");

    if (!booking)
      return res.status(404).json({ message: "Booking not found" });

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch booking" });
  }
});

/* ----------------------------------------------------
   DELETE BOOKING
---------------------------------------------------- */
router.delete("/booking/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking)
      return res.status(404).json({ message: "Booking not found" });

    await booking.deleteOne();
    res.json({ message: "Booking deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete booking" });
  }
});

/* ----------------------------------------------------
   UPDATE BOOKING STATUS
---------------------------------------------------- */
router.put("/booking/update-status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["Pending", "Paid", "Unpaid", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({
      message: "Status updated successfully",
      booking: updated,
    });
  } catch (error) {
    console.error("Status Update Error:", error);
    res.status(500).json({ message: "Failed to update status", error });
  }
});

/* ----------------------------------------------------
   VERIFY TICKET BY QR
---------------------------------------------------- */
router.get("/booking/verify/:ticketNumber", async (req, res) => {
  try {
    const ticketNumber = req.params.ticketNumber;

    const booking = await Booking.findOne({ ticketNumber }).populate("eventId");

    if (!booking) {
      return res.status(404).json({
        valid: false,
        message: "Invalid ticket. No matching record found.",
      });
    }

    res.json({
      valid: true,
      message: "Ticket is valid",
      booking,
    });
  } catch (error) {
    console.error("QR Verification Error:", error);
    res.status(500).json({ message: "Verification failed", error });
  }
});

/* ----------------------------------------------------
   SEND EMAIL WITH TICKET + QR CODE
---------------------------------------------------- */
router.post("/booking/send-email/:id", async (req, res) => {
  try {
    const { subject, message, htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ message: "htmlContent is required" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const verificationURL = `https://your-domain.com/verify-ticket/${booking.ticketNumber}`;

    const qrCodeDataURL = await QRCode.toDataURL(verificationURL);

    const finalHTML = htmlContent.replace("{{QR_CODE}}", qrCodeDataURL);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Event Ticket" <${process.env.EMAIL_USER}>`,
      to: booking.emailAddress,
      subject: subject || "Your Ticket",
      text: message || "Here is your ticket",
      html: finalHTML,
    });

    res.json({
      message: "Email sent successfully",
      qrCode: qrCodeDataURL,
    });
  } catch (error) {
    console.error("Email Error:", error);
    res.status(500).json({ message: "Email sending failed", error });
  }
});

export default router;
