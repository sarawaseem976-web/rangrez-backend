import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },

    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    emailAddress: { type: String, required: true },
    cityName: { type: String, required: true },

    // Auto-generated 6 digit ticket number
    ticketNumber: {
      type: String,
      unique: true,
      // No required:true here (because pre-save generates it)
    },

    ticketType: {
      type: String,
      enum: ["Standard", "VIP"],
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Paid", "Unpaid", "Cancelled"],
      default: "Pending",
    },

    receiptImage: { type: String, required: true },

    dateCreated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ==================================================
// AUTO GENERATE 6-DIGIT UNIQUE TICKET NUMBER
// ==================================================
bookingSchema.pre("save", async function () {
  if (this.ticketNumber) return;

  let unique = false;
  let generated;

  while (!unique) {
    generated = Math.floor(100000 + Math.random() * 900000).toString();

    const exists = await mongoose.models.Booking.findOne({
      ticketNumber: generated,
    });

    if (!exists) unique = true;
  }

  this.ticketNumber = generated;
});

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;
