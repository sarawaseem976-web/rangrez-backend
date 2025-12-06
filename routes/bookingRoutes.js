import dotenv from "dotenv";
dotenv.config();

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

/* ----------------------------------------------------
   MULTER MEMORY STORAGE
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

    if (!req.file) return res.status(400).json({ message: "Receipt image is required" });
    if (!eventId) return res.status(400).json({ message: "eventId is required" });

    const uploadResult = await uploadBufferToCloudinary(req.file.buffer, "receipts");

    const ticketNumber = Math.floor(100000 + Math.random() * 900000);

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

    res.status(201).json({ message: "Booking created successfully", booking: newBooking });
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
    const bookings = await Booking.find().populate("eventId").sort({ createdAt: -1 });
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
    if (!booking) return res.status(404).json({ message: "Booking not found" });
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
    if (!booking) return res.status(404).json({ message: "Booking not found" });

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
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status value" });

    const updated = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!updated) return res.status(404).json({ message: "Booking not found" });

    res.json({ message: "Status updated successfully", booking: updated });
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
      return res.status(404).json({ valid: false, message: "Invalid ticket. No matching record found." });
    }

    res.json({ valid: true, message: "Ticket is valid", booking });
  } catch (error) {
    console.error("QR Verification Error:", error);
    res.status(500).json({ message: "Verification failed", error });
  }
});

/* ----------------------------------------------------
   SEND EMAIL WITH TICKET + INLINE QR CODE (CID)
---------------------------------------------------- */
router.post("/booking/send-email/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("eventId");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const { subject } = req.body;

    // Generate QR code as a Buffer (NOT Base64)
    const verificationURL = `${process.env.CLIENT_URI}/verify-ticket/${booking.ticketNumber}`;
    const qrBuffer = await QRCode.toBuffer(verificationURL, {
      margin: 2,
      scale: 6,
    });

    /* ----------------------------------------------------
       EMAIL TEMPLATE USING CID INLINE IMAGE
    ---------------------------------------------------- */
    const emailHTML = `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:#f4f4f4; font-family:Arial, sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0;">
<tr><td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:6px; overflow:hidden;">

  <tr>
    <td style="background:#222831; text-align:center; padding:24px;">
      <h2 style="color:#fff; margin:0; font-size:22px;">${booking.eventId?.title}</h2>
      <p style="color:#ccc; margin:6px 0 0;">Your Entry Pass</p>
    </td>
  </tr>

  <tr>
    <td style="padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0; border-radius:6px;">
        <tr valign="top">

          <td style="padding:16px; width:65%; font-size:14px;">
            <p><strong>Ticket No:</strong> ${booking.ticketNumber}</p>
            <p><strong>Name:</strong> ${booking.firstName} ${booking.lastName}</p>
            <p><strong>Category:</strong> ${booking.ticketType}</p>
            <p><strong>City:</strong> ${booking.cityName}</p>
            <p><strong>Date:</strong> ${booking.eventId?.date}</p>
            <p><strong>Time:</strong> ${booking.eventId?.eventTime}</p>
            <p><strong>Location:</strong> ${booking.eventId?.address}</p>
          </td>

          <td style="padding:16px; text-align:center; width:35%;">
            <p style="font-size:11px; margin-bottom:6px; color:#666;">Scan QR to verify</p>

            <!-- INLINE ATTACHMENT QR -->
            <img src="cid:qrCodeImg" width="140" height="140" alt="QR Code" style="display:block;">
          </td>

        </tr>
      </table>

      <p style="margin-top:16px; font-size:12px; color:#666; text-align:center;">
        Please show this ticket at the entry gate. Valid for one person only.
      </p>

    </td>
  </tr>

  <tr>
    <td style="background:#f7f7f7; text-align:center; padding:12px; color:#777; font-size:12px;">
      Thank you for your purchase!
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>
`;

    /* ----------------------------------------------------
       SEND EMAIL (WITH QR AS INLINE ATTACHMENT)
    ---------------------------------------------------- */
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"Event Ticket" <${process.env.EMAIL_USER}>`,
      to: booking.emailAddress,
      subject: subject || "Your Ticket",
      html: emailHTML,
      attachments: [
        {
          filename: "qrcode.png",
          content: qrBuffer,
          cid: "qrCodeImg", // MUST match img src="cid:qrCodeImg"
        },
      ],
    });

    res.json({ message: "Email sent successfully" });

  } catch (error) {
    console.error("Email Error:", error);
    res.status(500).json({ message: "Email sending failed", error });
  }
});

export default router;
