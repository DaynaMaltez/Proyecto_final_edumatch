import mongoose, { Schema } from 'mongoose';

const enrollmentSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'TutoringService', required: true },
  tutorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true, collection: 'inscripciones' });
enrollmentSchema.index({ studentId: 1, serviceId: 1 }, { unique: true });
export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
