import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            // enum: ['C1', 'C2', 'C3', 'C4', 'C6',
            //     'C Ulm', 'Wabi', 'Buero', 'FacTech'],
            required: true
        },
        members: [],
        cars: [],
        wifi_ip: {
            type: String
        }
    },
    { timestamps: true }
);

export default mongoose.model("Department", departmentSchema);
