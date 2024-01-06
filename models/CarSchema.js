import mongoose from "mongoose";

const carSchema = new mongoose.Schema(
    {
        car_name: {
            type: String,
            required: true
        },
        car_number: {
            type: String,
            required: true
        },
        register_date: {
            type: Date,
            required: true
        },
        department_name: []
    },
    { timestamps: true }
);

export default mongoose.model("Car", carSchema);