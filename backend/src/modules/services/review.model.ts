import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, required: true },
  tutorId: { type: Schema.Types.ObjectId, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  bookingId: { type: Schema.Types.ObjectId, ref: 'BookingRecord', required: true },
  serviceTitle: { type: String, required: true },
  studentName: { type: String, required: true },
  comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
}, { timestamps: true, collection: 'resenas_clases' });
schema.index({ bookingId: 1 }, { unique: true });
schema.index({ tutorId: 1, createdAt: -1 });
export const Review = mongoose.model('Review', schema);
