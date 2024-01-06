import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        address: {
            type: String,
        },
        dob: {
            type: String,
        },
        gender: {
            type: String,
        },
        role: {
            type: String,
            enum: ['Inhaber', 'Manager', 'Employee'],
            default: 'Employee',
        },
        total_time_per_month: {
            type: Number,
            default: 0
            // required: true
        },
        house_rent_money: {
            type: Number,
            default: 0
        },
        default_day_off: {
            type: Number,
            default: 0
        },
        realistic_day_off: {
            type: Number
        },
        department: [
            {
                name: {
                    type: String,
                },
                position: [
                    {
                        type: String,
                        // dịch vụ, quán ba, Phòng bếp, delivery, tài xế
                        enum: ['Service', 'Bar', 'Küche', 'Lito', 'Autofahrer', 'Fahrradfahrer',
                            'Büro', 'Lehrgang für Azubi', 'FacTech GmbH'],
                    }
                ],
                schedules: [
                    {
                        date: {
                            type: Date,
                            required: true
                        },
                        shift_design: [
                            {
                                position: {
                                    type: String
                                },
                                shift_code: {
                                    type: String,
                                    required: true
                                },
                                time_slot: {
                                    type: Object,
                                },
                                time_left: {
                                    type: Number
                                }
                            }
                        ]
                    },
                ],
                attendance_stats: [
                    {
                        year: {
                            type: Number
                        },
                        month: {
                            type: Number
                        },
                        date_on_time: {
                            type: Number
                        },
                        date_late: {
                            type: Number
                        },
                        date_missing: {
                            type: Number
                        },
                    }
                ],
            }
        ],
        dayOff_schedule: [],
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        active_day: {
            type: Date
        },
        inactive_day: {
            type: Date
        }
    },
    { timestamps: true }
);

export default mongoose.model("Employee", employeeSchema);