import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tutorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'TutoringService', required: true },
  serviceTitle: { type: String, required: true },
  category: String,
  studentName: String, tutorName: String,
  date: { type: String, required: true }, startTime: { type: String, required: true }, endTime: { type: String, required: true },
  modality: { type: String, enum: ['virtual', 'at_tutor', 'at_student'], required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'], default: 'pending' },
  completedAt: Date,
  seriesId: String, bufferMinutes: { type: Number, default: 0 },
  hourlyRate: Number, travelCost: Number, total: Number,
  destination: { latitude: Number, longitude: Number },
}, { timestamps: true, collection: 'reservas' });
schema.index({ tutorId: 1, date: 1, status: 1 });
schema.index({ studentId: 1, date: 1, status: 1 });
export const BookingRecord = mongoose.model('BookingRecord', schema);
