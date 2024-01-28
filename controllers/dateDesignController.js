import { BAD_REQUEST, CREATED, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import DepartmentSchema from "../models/DepartmentSchema.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import ShiftSchema from "../models/ShiftSchema.js";
import StatsSchema from "../models/StatsSchema.js";
import { createError } from "../utils/error.js";

export const createMultipleDateDesigns = async (req, res, next) => {
    const shiftCode = req.body.shift_code;
    const employeeID = req.query.employeeID;
    const employeeName = req.query.employeeName;
    const departmentName = req.query.department_name;
    const dates = req.body.dates;
    const convertToMinutes = (timeString) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    };
    const errorDates = [];
    try {
        const department = await DepartmentSchema.findOne({ name: departmentName });
        if (!department) return next(createError(NOT_FOUND, "Department not found!"));

        const shift = await ShiftSchema.findOne({ code: shiftCode });
        if (!shift) return next(createError(NOT_FOUND, "Shift not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID, name: employeeName });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        const employeeDepartment = employee.department.find(dep => dep.name === departmentName);
        if (!employeeDepartment) return next(createError(NOT_FOUND, "Employee does not belong to the specified department!"));

        for (const dateString of dates) {
            const [month, day, year] = dateString.split('/');
            const dateObj = new Date(year, month - 1, day);

            // Check if date falls within any allowed day off period
            const isDayOff = employee.dayOff_schedule.some(dayOff => {
                const start = new Date(dayOff.date_start);
                const end = new Date(dayOff.date_end);
                return dayOff.allowed && dateObj >= start && dateObj <= end;
            });

            if (isDayOff) {
                errorDates.push({ date: dateString, message: "Date conflicts with an allowed day off." });
                continue;
            }

            let stats = await StatsSchema.findOne({
                employee_id: employee.id,
                employee_name: employee.name,
                year: year,
                month: month
            });

            if (!stats) {
                stats = new StatsSchema({
                    employee_id: employee.id,
                    employee_name: employee.name,
                    year: year,
                    month: month,
                    default_schedule_times: employee.total_time_per_month,
                    realistic_schedule_times: employee.total_time_per_month - shift.time_slot.duration
                });
            } else {
                stats.realistic_schedule_times -= shift.time_slot.duration;
            }

            let conflictFound = false;
            for (const department of employee.department) {
                let schedule = department.schedules.find(s =>
                    s.date.toISOString().split('T')[0] === dateObj.toISOString().split('T')[0]);

                let existsTimeRanges = schedule ? schedule.shift_design.map(design => ({
                    startTime: design.time_slot.start_time,
                    endTime: design.time_slot.end_time
                })) : [];

                const newShiftStartTime = shift.time_slot.start_time;
                const newShiftEndTime = shift.time_slot.end_time;

                const hasConflict = existsTimeRanges.some(range => {
                    const existingStartTime = convertToMinutes(range.startTime);
                    const existingEndTime = convertToMinutes(range.endTime);
                    const newStartTime = convertToMinutes(newShiftStartTime);
                    const newEndTime = convertToMinutes(newShiftEndTime);

                    const startsDuringExisting = newStartTime >= existingStartTime && newStartTime < existingEndTime;
                    const endsDuringExisting = newEndTime > existingStartTime && newEndTime <= existingEndTime;
                    const overlapsExistingEnd = newStartTime <= existingEndTime + 30;

                    return startsDuringExisting || endsDuringExisting || overlapsExistingEnd;
                });

                let shiftExistsInDepartment = department.schedules.some(sch =>
                    sch.date.toISOString().split('T')[0] === dateObj.toISOString().split('T')[0] &&
                    sch.shift_design.some(design => design.shift_code === shiftCode)
                );

                if (hasConflict || shiftExistsInDepartment) {
                    errorDates.push({ date: dateString, message: "Shift conflict or duplicate shift code detected in one of the departments." });
                    conflictFound = true;
                    break;
                }
            }

            if (conflictFound) continue;

            let schedule = employeeDepartment.schedules.find(s => s.date.toISOString().split('T')[0] === dateObj.toISOString().split('T')[0]);
            await stats.save();
            if (!schedule) {
                schedule = {
                    date: dateObj,
                    shift_design: [{
                        position: req.body.position,
                        shift_code: shift.code,
                        time_slot: shift.time_slot,
                        time_left: stats.realistic_schedule_times
                    }]
                };
                employeeDepartment.schedules.push(schedule);
            }
            schedule.shift_design.push({
                position: req.body.position,
                shift_code: shift.code,
                time_slot: shift.time_slot,
                time_left: stats.realistic_schedule_times
            });

            if (departmentName === "School") {
                const currentYear = currentTime.getFullYear();
                const currentMonth = currentTime.getMonth() + 1;
                const newAttendance = new AttendanceSchema({
                    date: schedule.date,
                    employee_id: employee.id,
                    employee_name: employee.name,
                    role: employee.role,
                    department_name: departmentName,
                    position: employee.position,
                    shift_info: {
                        shift_code: "School Shift",
                        total_hour: 8,
                        total_minutes: 0,
                    },
                    status: "checked",
                });
                const departmentIndex = employee.department.findIndex(dep => dep.name === departmentName);
                const statsIndex = employee.department[departmentIndex].attendance_stats.findIndex(stat =>
                    stat.year === currentYear && stat.month === currentMonth
                );

                if (statsIndex > -1) {
                    employee.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 1;
                } else {
                    const newStat = {
                        year: currentYear,
                        month: currentMonth,
                        date_on_time: 1,
                        date_late: 0,
                        date_missing: 0,
                    };
                    employee.department[departmentIndex].attendance_stats.push(newStat);
                }
                await newAttendance.save();
                await employee.save();
                console.log('Attendance created for employee in school:', employee.id);

                let stats = await StatsSchema.findOne({
                    employee_id: employee.id,
                    year: currentYear,
                    month: currentMonth
                });
                if (stats) {
                    stats.attendance_total_times = stats.attendance_total_times;
                    stats.attendance_overtime = stats.attendance_total_times - stats.default_schedule_times;
                    await stats.save();
                } else {
                    console.log("Employee's stats not found");
                }
            }
        }

        await employee.save();
        const responseMessage = {
            employee_id: employee.id,
            employee_name: employee.name,
            email: employee.email,
            schedule: employee.department.map(dep => dep.schedules),
            error_dates: errorDates
        };

        res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: responseMessage
        });
    } catch (err) {
        next(err);
    }
};

export const getDateDesign = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const departmentName = req.query.department_name;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        const shiftDesigns = [];

        employee.department.forEach(department => {
            if (departmentName && department.name !== departmentName) {
                return;
            }

            department.schedules.forEach(schedule => {
                const scheduleDate = new Date(schedule.date);
                if ((!targetYear || scheduleDate.getFullYear() === targetYear) &&
                    (!targetMonth || scheduleDate.getMonth() === targetMonth) &&
                    (!targetDate || scheduleDate.getTime() === targetDate.getTime())) {

                    schedule.shift_design.forEach(shift => {
                        shiftDesigns.push({
                            date: scheduleDate,
                            department_name: department.name,
                            position: shift.position,
                            shift_code: shift.shift_code,
                            time_slot: shift.time_slot,
                            shift_type: shift.shift_type,
                        });
                    });
                }
            });
        });

        if (shiftDesigns.length === 0) {
            return next(createError(NOT_FOUND, "No shift designs found for the specified criteria!"));
        }

        res.status(OK).json({
            success: true,
            status: OK,
            message: shiftDesigns
        });
    } catch (err) {
        next(err);
    }
};

export const deleteDateSpecific = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"))
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        const existingDateIndex = employee.schedules.findIndex(schedule => {
            return schedule.date.getTime() === new Date(req.body.date).getTime();
        });

        if (existingDateIndex === -1) {
            return next(createError(NOT_FOUND, "Date design not found!"));
        }

        // Remove the date design
        employee.schedules.splice(existingDateIndex, 1);

        await employee.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: "Date design deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};


