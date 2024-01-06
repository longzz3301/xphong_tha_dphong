import mongoose from "mongoose";

const statsSchema = new mongoose.Schema(
    {
        employee_id: {
            type: String,
            required: true
        },
        employee_name: {
            type: String,
            required: true
        },
        year: {
            type: Number,
            required: true
        },
        month: {
            type: Number,
            required: true
        },
        default_schedule_times: {
            type: Number,
            required: true
        },
        realistic_schedule_times: {
            type: Number,
            default: 0
        },
        attendance_total_times: {
            type: Number,
            default: 0
        },
        attendance_overtime: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

export default mongoose.model("Stats", statsSchema);