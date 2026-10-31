import mongoose, { Schema } from 'mongoose';

export const serviceCategories = ['Matemáticas', 'Idiomas', 'Programación', 'Ciencias', 'Apoyo escolar', 'Preparación para exámenes'] as const;
export const serviceModalities = ['virtual', 'at_tutor', 'at_student'] as const;

const serviceSchema = new Schema({
  tutorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
  description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
  category: { type: String, required: true, maxlength: 80 },
  modality: { type: String, enum: serviceModalities, required: true },
  hourlyRate: { type: Number, required: true, min: 0, max: 1_000_000 },
  travelCost: { type: Number, required: true, default: 0, min: 0, max: 1_000_000 },
  bookingRevision: { type: Number, default: 0 },
}, { timestamps: true, collection: 'tutorias', strict: 'throw' });

export const TutoringService = mongoose.model('TutoringService', serviceSchema);
