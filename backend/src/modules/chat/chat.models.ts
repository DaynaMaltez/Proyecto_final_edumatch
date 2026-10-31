import mongoose, { Schema } from 'mongoose';

const conversationSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tutorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'conversaciones' });
conversationSchema.index({ studentId: 1, tutorId: 1 }, { unique: true });
export const Conversation = mongoose.model('Conversation', conversationSchema);

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true, maxlength: 80 },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  readAt: { type: Date, default: null },
}, { timestamps: true, collection: 'mensajes' });
messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ conversationId: 1, senderId: 1, clientId: 1 }, { unique: true });
export const ChatMessage = mongoose.model('ChatMessage', messageSchema);
