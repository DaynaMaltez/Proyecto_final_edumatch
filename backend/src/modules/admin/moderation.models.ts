import mongoose, { Schema } from 'mongoose';

const reportSchema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  targetId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  reason: { type: String, enum: ['absence', 'conduct', 'charges', 'other'], required: true },
  evidence: { type: String, required: true, minlength: 10, maxlength: 4000 },
  status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open' },
  decision: String, reviewedBy: Schema.Types.ObjectId, reviewedAt: Date,
}, { timestamps: true, collection: 'denuncias' });
reportSchema.index({ targetId: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, targetId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
export const ConductReport = mongoose.model('ConductReport', reportSchema);

const appealSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  caseId: { type: String, required: true },
  suspensionReason: { type: String, required: true },
  statement: { type: String, required: true, minlength: 20, maxlength: 4000 },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  decision: String, reviewedBy: Schema.Types.ObjectId, reviewedAt: Date,
}, { timestamps: true, collection: 'apelaciones' });
appealSchema.add({ decisions: [{ status: String, decision: String, reviewedBy: Schema.Types.ObjectId, reviewedAt: Date }] });
appealSchema.index({ userId: 1, caseId: 1 }, { unique: true });
export const AccountAppeal = mongoose.model('AccountAppeal', appealSchema);
