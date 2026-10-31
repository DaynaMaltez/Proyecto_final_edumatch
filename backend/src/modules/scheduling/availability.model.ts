import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const availabilitySchema = new Schema({
  tutorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  serviceId: { type: Schema.Types.ObjectId, ref: 'TutoringService' },
  serviceTitle: String,
  seriesId: String,
  bufferMinutes: { type: Number, default: 0, min: 0, max: 180 },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  modality: { type: String, enum: ['virtual', 'in_person', 'at_tutor', 'at_student'], required: true },
}, { timestamps: true });

type AvailabilityData = InferSchemaType<typeof availabilitySchema>;
export const Availability = (mongoose.models.Availability as Model<AvailabilityData> | undefined)
  ?? mongoose.model('Availability', availabilitySchema, 'disponibilidades');
