import { CREATED, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import ShiftSchema from "../models/ShiftSchema.js";
import { createError } from "../utils/error.js";

export const createShift = async (req, res, next) => {
    const shift_code = req.body.code;
    const start_time = req.body.time_slot?.start_time;
    const end_time = req.body.time_slot?.end_time;
    try {
        const [startHours, startMinutes] = start_time.split(":").map(Number);
        const [endHours, endMinutes] = end_time.split(":").map(Number);

        let durationHours = endHours - startHours;
        let durationMinutes = endMinutes - startMinutes;

        if (durationMinutes < 0) {
            durationHours -= 1;
            durationMinutes += 60;
        }

        const duration = durationHours + durationMinutes / 60;
        const newShift = new ShiftSchema({
            code: shift_code,
            ...req.body,
            time_slot: {
                ...req.body.time_slot,
                duration: duration
            }
        });

        await newShift.save();
        res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newShift,
        });
    } catch (err) {
        next(err);
    }
};

export const getAllShifts = async (req, res, next) => {
    try {
        const shifts = await ShiftSchema.find();
        if (!shifts) return next(createError(NOT_FOUND, "Shift not found!"))

        res.status(OK).json({
            success: true,
            status: OK,
            message: shifts,
        });
    } catch (err) {
        next(err);
    }
};

export const getShiftByCode = async (req, res, next) => {
    const shift_code = req.query.code;
    try {
        const shift = await ShiftSchema.findOne({ code: shift_code });
        if (!shift) return next(createError(NOT_FOUND, "Shift not found!"))

        res.status(OK).json({
            success: true,
            status: OK,
            message: shift,
        });
    } catch (err) {
        next(err);
    }
};

export const getShiftByName = async (req, res, next) => {
    const shift_name = req.query.name;
    try {
        const shift = await ShiftSchema.findOne({ name: shift_name });
        if (!shift) return next(createError(NOT_FOUND, "Shift not found!"))

        res.status(OK).json({
            success: true,
            status: OK,
            message: shift,
        });
    } catch (err) {
        next(err);
    }
};

export const updateShift = async (req, res, next) => {
    const shift_code = req.query.code;
    try {
        const shift = await ShiftSchema.findOne({ code: shift_code });
        if (!shift) return next(createError(NOT_FOUND, "Shift not found!"))

        const updateShift = await ShiftSchema.findOneAndUpdate(
            { code: shift_code },
            { $set: req.body },
            { $new: true },
        )

        await updateShift.save();
        res.status(OK).json({
            success: true,
            status: OK,
            message: updateShift,
        });
    } catch (err) {
        next(err);
    }
};

export const deleteShiftByCode = async (req, res, next) => {
    const shift_code = req.query.code;
    try {
        const shift = await ShiftSchema.findOne({ code: shift_code });
        if (!shift) return next(createError(NOT_FOUND, "Shift not found!"))

        await ShiftSchema.findOneAndDelete({ code: shift_code });
        res.status(OK).json({
            success: true,
            status: OK,
            message: "Shift was deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};