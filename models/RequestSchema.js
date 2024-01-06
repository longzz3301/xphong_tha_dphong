import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
    {
        employee_id: {
            type: String,
            required: true
        },
        employee_name: {
            type: String,
            required: true
        },
        default_total_dayOff: {
            type: Number
        },
        request_dayOff_start: {
            type: Date,
            required: true
        },
        request_dayOff_end: {
            type: Date,
            required: true
        },
        request_content: {
            type: String,
            required: true
        },
        answer_status: {
            type: String,
            enum: ['approved', 'denied', 'pending'],
            default: 'pending'
        }
    },
    { timestamps: true }
);

export default mongoose.model("Request", requestSchema);