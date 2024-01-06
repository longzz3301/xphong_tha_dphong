import mongoose from "mongoose";

const dayOffSchema = new mongoose.Schema(
    {
        date_start: {
            type: Date,
            required: true
        },
        date_end: {
            type: Date,
            required: true
        },
        duration: {
            type: Number,
            required: true
        },
        name: {
            type: String,
        },
        type: {
            type: String,
            enum: ['global', 'specific']
        },
        members: [],
        allowed: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

export default mongoose.model("DayOff", dayOffSchema);
