import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
    {
        date: {
            type: Date,
            required: true,
        },
        employee_id: {
            type: String,
            required: true,
        },
        employee_name: {
            type: String,
            required: true,
        },
        role: {
            type: String,
        },
        department_name: {
            type: String,
        },
        position: {
            type: String,
        },
        shift_info: {
            shift_code: {
                type: String,
            },
            shift_type: {
                type: String,
            },
            time_slot: {
                check_in: {
                    type: Boolean,
                },
                check_in_time: {
                    type: String,
                },
                check_in_status: {
                    type: String,
                    enum: ['on time', 'late']
                },
                check_out: {
                    type: Boolean,
                },
                check_out_time: {
                    type: String,
                },
                check_out_status: {
                    type: String,
                    enum: ['on time', 'late']
                },
            },
            total_hour: {
                type: Number
            },
            total_minutes: {
                type: Number
            }
        },
        car_info: {
            car_type: {
                type: String,
                enum: ['company', 'private']
            },
            car_name: {
                type: String
            },
            car_number: {
                type: String
            },
            register_date: {
                type: Date
            }
        },
        check_in_km: {
            type: Number,
            default: 0
        },
        check_out_km: {
            type: Number,
            default: 0
        },
        total_km: {
            type: Number,
            default: 0
        },
        bar: {
            // both service & lito
            type: Number,
            default: 0
        },
        gesamt: {
            // service: tổng
            type: Number,
            default: 0
        },
        trinked_ec: {
            // service: tips
            type: Number,
            default: 0
        },
        trink_geld: {
            // service: phiếu tip
            type: Number,
            default: 0
        },
        auf_rechnung: {
            // service: hóa đơn
            type: Number,
            default: 0
        },
        kredit_karte: {
            // lito: thẻ ngân hàng
            type: Number,
            default: 0
        },
        kassen_schniff: {
            // lito: tiền mặt
            type: Number,
            default: 0
        },
        gesamt_ligerbude: {
            // lito: tổng gian hàng giao hàng
            type: Number,
            default: 0
        },
        gesamt_liegerando: {
            // lito: tổng số lần giao hàng
            type: Number,
            default: 0
        },
        results: {
            // both service & lito
            type: Number
        },
        status: {
            type: String,
            enum: ['checked', 'missing']
        }
    },
    { timestamps: true }
);

export default mongoose.model("Attendance", attendanceSchema);
