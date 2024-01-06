import mongoose from "mongoose";

const salarySchema = new mongoose.Schema(
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
        date_calculate: {
            type: Date,
            required: true
        },
        total_salary: {
            type: Number,
            required: true
        },
        total_times: {
            type: Number,
            default: 0
        },
        day_off: {
            type: Number,
            default: 0
        },
        hour_normal: [
            {
                department_name: {
                    type: String
                },
                total_hour: {
                    type: Number
                },
                total_minutes: {
                    type: Number
                }
            }
        ],
        total_hour_work: {
            type: Number,
            default: 0
        },
        total_hour_overtime: {
            type: Number,
            default: 0
        },
        total_km: {
            type: Number,
            default: 0
        },
        a_parameter: {
            type: Number,
            default: 0
        },
        b_parameter: {
            type: Number,
            default: 0
        },
        c_parameter: {
            type: Number,
            default: 0
        },
        d_parameter: {
            type: Number,
            default: 0.25
        },
        f_parameter: {
            type: Number,
            default: 0
        },
    },
    { timestamps: true }
);

export default mongoose.model("Salary", salarySchema);
