import mongoose from "mongoose";

const logSchema = new mongoose.Schema(
    {
        year: {
            type: Number,
            required: true
        },
        month: {
            type: Number,
            required: true
        },
        date: {
            type: Date,
            required: true
        },
        type_update: {
            type: String,
            required: true
        },
        editor_name: {
            type: String,
            required: true
        },
        editor_role: {
            type: String,
            required: true
        },
        edited_name: {
            type: String,
            required: true
        },
        edited_role: {
            type: String,
            required: true
        },
        before_update: {
            type: Object
        },
        after_update: {
            type: Object
        }
    },
    { timestamps: true }
);

export default mongoose.model("Log", logSchema);