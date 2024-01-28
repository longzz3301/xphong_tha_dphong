import { CONFLICT, CREATED, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import DayOffSchema from "../models/DayOffSchema.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import { createError } from "../utils/error.js";

function calculateDuration(startDate, endDate) {
    const oneDay = 24 * 60 * 60 * 1000;

    const start = new Date(startDate);
    const end = new Date(endDate);

    const durationInMilliseconds = Math.abs(start - end);
    const durationInDays = Math.round(durationInMilliseconds / oneDay + 1);

    return durationInDays;
}

export const createDayOff = async (req, res, next) => { // 
    const date_start = req.body.date_start;
    const date_end = req.body.date_end;
    const employeeID = req.query.employeeID;
    try {
        const newDayOff = new DayOffSchema({
            date_start: new Date(date_start),
            date_end: new Date(date_end),
            name: req.body.name,
            type: req.body.type,
            allowed: req.body.allowed,
        });

        const duration = calculateDuration(date_start, date_end);
        newDayOff.duration = duration;
        
        const dateChecking = await DayOffSchema.findOne({
            date_start: newDayOff.date_start,
            date_end: newDayOff.date_end,
            type: newDayOff.type
        });
        if (dateChecking) return next(createError(CONFLICT, "Day Off is already exists!"));

        if (newDayOff.type === 'specific') {
            const employee = await EmployeeSchema.findOne({ id: employeeID });
            if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
            if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

            employee.dayOff_schedule.push({
                date_start: newDayOff.date_start,
                date_end: newDayOff.date_end,
                duration: duration,
                name: newDayOff.name,
                type: newDayOff.type,
                allowed: newDayOff.allowed
            });

            if (newDayOff.allowed === true) {
                employee.realistic_day_off = employee.realistic_day_off - newDayOff.duration;
            }

            newDayOff.members.push({
                id: employee.id,
                name: employee.name,
                email: employee.email,
                role: employee.role,
                position: employee.position,
                status: employee.status
            });

            await newDayOff.save();
            await employee.save();
        } else if (newDayOff.type === 'global') {
            // Get information of all employees and add to the allowed field
            const employees = await EmployeeSchema.find({ status: "active" });
            employees.forEach(employee => {
                newDayOff.members.push({
                    id: employee.id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role,
                    position: employee.position,
                    status: employee.status
                });

                if (newDayOff.allowed === true) {
                    employee.realistic_day_off = employee.realistic_day_off - newDayOff.duration;
                }

                // Add the new day off to all employees
                employee.dayOff_schedule.push({
                    date_start: newDayOff.date_start,
                    date_end: newDayOff.date_end,
                    duration: duration,
                    name: newDayOff.name,
                    type: newDayOff.type,
                    allowed: newDayOff.allowed
                });
                employee.save();
            });
        }

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newDayOff,
        });
    } catch (err) {
        next(err);
    }
};

export const getAllGlobalDayOffs = async (req, res, next) => {
    try {
        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        if (!globalDayOffs) return next(createError(NOT_FOUND, "Day Off not found!"));

        return res.status(OK).json({
            success: true,
            status: OK,
            message: globalDayOffs,
        });
    } catch (err) {
        next(err);
    }
};

export const getDayOffById = async (req, res, next) => {
    try {
        const day_off = await DayOffSchema.findOne({ _id: req.params._id });
        if (!day_off) return next(createError(NOT_FOUND, "Day Off not found!"));

        return res.status(OK).json({
            success: true,
            status: OK,
            message: day_off,
        });
    } catch (err) {
        next(err);
    }
};

export const deleteDayOffById = async (req, res, next) => {
    try {
        const day_off = await DayOffSchema.findOne({ _id: req.params._id });
        if (!day_off) return next(createError(NOT_FOUND, "Day Off not found!"));

        const employeeIds = day_off.members.map(member => member.id);

        // Update each employee's dayOff_schedule
        await Promise.all(
            employeeIds.map(async employeeId => {
                const employee = await EmployeeSchema.findOne({ id: employeeId });
                if (employee) {
                    // Remove day off from the employee's dayOff_schedule
                    employee.dayOff_schedule = employee.dayOff_schedule.filter(dayOffSchedule =>
                        dayOffSchedule.date_start.getTime() !== day_off.date_start.getTime() ||
                        dayOffSchedule.date_end.getTime() !== day_off.date_end.getTime()
                    );
                    await employee.save();
                }
            })
        );

        // Now delete the day off
        const deletedDayOff = await DayOffSchema.findOneAndDelete({ _id: req.params._id });

        return res.status(OK).json({
            success: true,
            status: OK,
            message: "Day Off deleted successfully!",
            deletedDayOff,
        });
    } catch (err) {
        next(err);
    }
};

export const getEmployeeDayOffs = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return res.status(NOT_FOUND).json({
            success: false,
            status: NOT_FOUND,
            message: "Employee not found!",
        });

        return res.status(OK).json({
            success: true,
            status: OK,
            message: employee.dayOff_schedule,
        });
    } catch (err) {
        next(err);
    }
};

export const deleteEmployeeDayOff = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return res.status(NOT_FOUND).json({
            success: false,
            status: NOT_FOUND,
            message: "Employee not found!",
        });

        const dayOffIndex = employee.dayOff_schedule.findIndex(dayOff => dayOff._id == req.params._id);
        if (dayOffIndex === -1) return res.status(NOT_FOUND).json({
            success: false,
            status: NOT_FOUND,
            message: "Day Off not found for the employee!",
        });

        employee.dayOff_schedule.splice(dayOffIndex, 1);
        await employee.save();

        return res.status(NO_CONTENT).json({
            success: true,
            status: NO_CONTENT,
            message: "Day Off deleted successfully!",
        });
    } catch (err) {
        next(err);
    }
};
