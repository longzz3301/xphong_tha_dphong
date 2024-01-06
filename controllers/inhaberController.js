import { createError } from "../utils/error.js";
import { BAD_REQUEST, CREATED, FORBIDDEN, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import AttendanceSchema from "../models/AttendanceSchema.js";
import AdminSchema from "../models/AdminSchema.js";
import ShiftSchema from "../models/ShiftSchema.js";
import cron from 'node-cron';
import DepartmentSchema from "../models/DepartmentSchema.js";
import RequestSchema from "../models/RequestSchema.js";
import LogSchema from "../models/LogSchema.js";
import StatsSchema from "../models/StatsSchema.js";
import SalarySchema from "../models/SalarySchema.js";
import DayOffSchema from "../models/DayOffSchema.js";
import CarSchema from "../models/CarSchema.js";

export const updateEmployeeByInhaber = async (req, res, next) => {
    const inhaber_name = req.query.inhaber_name;
    const employeeID = req.query.employeeID;
    try {
        const currentTime = new Date();
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;

        const inhaber = await EmployeeSchema.findOne({ role: 'Inhaber', name: inhaber_name });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        // Check if the employee is in any of the Inhaber's departments
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        const employeeInInhaberDepartments = employee.department.some(dep => inhaber.department.map(d => d.name).includes(dep.name));
        if (!employeeInInhaberDepartments) {
            return next(createError(FORBIDDEN, "Permission denied. Inhaber can only modify an employee in their departments."));
        }

        if (req.body.default_day_off !== undefined) {
            const day_off_change = req.body.default_day_off - employee.default_day_off;
            if (day_off_change > 0) {
                req.body.realistic_day_off = employee.realistic_day_off + day_off_change;
            } else if (day_off_change < 0) {
                req.body.realistic_day_off = Math.max(0, employee.realistic_day_off + day_off_change);
            }
        }

        if (req.body.total_time_per_month !== undefined) {
            let stats = await StatsSchema.findOne({
                employee_id: employee.id,
                year: currentYear,
                month: currentMonth
            });
            if (stats) {
                stats.default_schedule_times = req.body.total_time_per_month;
                stats.realistic_schedule_times = req.body.total_time_per_month + stats.realistic_schedule_times;
                stats.attendance_overtime = stats.attendance_total_times - req.body.total_time_per_month;
                await stats.save();
            }
        }

        const updatedEmployee = await EmployeeSchema.findOneAndUpdate(
            { id: employeeID },
            { $set: req.body },
            { new: true }
        );

        if (!updatedEmployee) {
            return next(createError(NOT_FOUND, "Employee not found!"));
        }
        if (updatedEmployee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        // Update employee information in each department
        for (let departmentObject of updatedEmployee.department) {
            const department = await DepartmentSchema.findOne({ name: departmentObject.name });
            if (department) {
                const memberIndex = department.members.findIndex(member => member.id === updatedEmployee.id);
                if (memberIndex !== -1) {
                    const originalPosition = department.members[memberIndex].position;
                    department.members[memberIndex] = {
                        ...department.members[memberIndex],
                        id: updatedEmployee.id,
                        name: updatedEmployee.name,
                        email: updatedEmployee.email,
                        role: updatedEmployee.role,
                        position: originalPosition,
                    };
                    await department.save();
                }
            }
        }

        // Update employee information in day off records
        await DayOffSchema.updateMany(
            { 'members.id': updatedEmployee.id },
            {
                $set: {
                    'members.$.id': updatedEmployee.id,
                    'members.$.name': updatedEmployee.name,
                    'members.$.email': updatedEmployee.email,
                    'members.$.role': updatedEmployee.role,
                }
            }
        );

        res.status(OK).json({
            success: true,
            status: OK,
            message: updatedEmployee,
        });
    } catch (err) {
        next(err);
    }
};

export const madeEmployeeInactiveByInhaber = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee already inactive!"));

        // Check if the employee is in one of the Inhaber's departments
        const isInhaberDepartment = employee.department.some(dept =>
            inhaber.department.some(inhaberDept => inhaberDept.name === dept.name)
        );
        if (!isInhaberDepartment) return next(createError(NOT_FOUND, "Employee not in Inhaber's department!"));

        const [month, day, year] = req.body.inactive_day.split('/').map(Number);
        const inactiveDate = new Date(year, month - 1, day);
        const currentDate = new Date();

        if (inactiveDate <= currentDate) {
            return next(createError(BAD_REQUEST, "Inactive day must be in the future."));
        }

        cron.schedule(`0 0 ${day} ${month} *`, async () => {
            employee.inactive_day = inactiveDate;
            employee.status = "inactive";

            // Update status in shared departments between employee and Inhaber
            for (let departmentObject of employee.department) {
                if (inhaber.department.some(inhaberDept => inhaberDept.name === departmentObject.name)) {
                    const department = await DepartmentSchema.findOne({ name: departmentObject.name });
                    if (department) {
                        const memberIndex = department.members.findIndex(member => member.id === employee.id);
                        if (memberIndex !== -1) {
                            department.members[memberIndex].status = "inactive";
                            await department.save();
                        }
                    }
                }
            }

            await DayOffSchema.updateMany(
                { 'members.id': employeeID },
                { $set: { 'members.$.status': "inactive" } }
            );

            await employee.save();
        });

        res.status(OK).json({
            success: true,
            status: OK,
            message: "Employee will be made inactive on the specified date."
        });
    } catch (err) {
        next(err);
    }
};

export const getEmployeeByIdForInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    const employeeID = req.query.employeeID;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        const isEmployeeInDepartment = employee.department.some(department =>
            inhaber.department.some(inhaberDepartment => inhaberDepartment.name === department.name)
        );

        if (!isEmployeeInDepartment) {
            return next(createError(FORBIDDEN, "Permission denied. Inhaber can only access an employee in their departments."));
        }

        // Filter out non-matching departments from the employee
        const filteredDepartments = employee.department.filter(dep =>
            inhaber.department.some(inhaberDep => inhaberDep.name === dep.name)
        );

        const filteredEmployee = {
            ...employee.toObject(),
            department: filteredDepartments
        };

        res.status(OK).json({
            success: true,
            status: OK,
            message: [filteredEmployee],
        });
    } catch (err) {
        next(err);
    }
};

export const deleteEmployeeByIdByInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    const employeeID = req.query.employeeID;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        const isEmployeeInDepartment = employee.department.some(department =>
            inhaber.department.some(inhaberDepartment => inhaberDepartment.name === department.name)
        );
        if (!isEmployeeInDepartment) {
            return next(createError(FORBIDDEN, "Permission denied. Inhaber can only delete an employee in their departments."));
        }

        for (let departmentObject of employee.department) {
            const department = await DepartmentSchema.findOne({ name: departmentObject.name });
            if (department) {
                department.members = department.members.filter(member => member.id !== employee.id);
                await department.save();
            }
        }

        await DayOffSchema.updateMany(
            { 'members.id': employeeID },
            { $pull: { members: { id: employeeID } } }
        );

        await EmployeeSchema.findOneAndDelete({ id: employeeID });
        res.status(OK).json({
            success: true,
            status: OK,
            message: "Employee deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};

export const searchSpecificForInhaber = async (req, res, next) => {
    const { role, details, status } = req.query;
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const regex = new RegExp(details, 'i');
        const employeeQueryCriteria = {
            'department.name': { $in: inhaber.department.map(dep => dep.name) },
            'role': role || { $in: ['Inhaber', 'Manager', 'Employee'] },
            ...(status && { 'status': status }),
            ...(details && { '$or': [{ 'id': regex }, { 'name': regex }] })
        };

        let employees = await EmployeeSchema.find(employeeQueryCriteria);

        if (employees.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No matching records found in your departments.",
            });
        }

        employees = employees.map(employee => {
            const filteredDepartments = employee.department.filter(dep =>
                inhaber.department.some(inhaberDep => inhaberDep.name === dep.name)
            );

            return {
                ...employee.toObject(),
                department: filteredDepartments
            };
        });

        res.status(OK).json({
            success: true,
            status: OK,
            message: employees,
        });
    } catch (err) {
        next(err);
    }
};

export const getEmployeesSchedulesByInhaber = async (req, res, next) => {
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const inhaberName = req.query.inhaber_name;
    try {
        // Fetch Inhaber and validate departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) {
            return res.status(NOT_FOUND).json({ error: "Inhaber not found" });
        }
        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        // Fetch employees in Inhaber's departments
        const employees = await EmployeeSchema.find({
            'department.name': { $in: inhaberDepartments }
        });

        const schedules = [];
        employees.forEach(employee => {
            employee.department.forEach(department => {
                if (inhaberDepartments.includes(department.name)) {
                    department.schedules.forEach(schedule => {
                        const scheduleDate = new Date(schedule.date);

                        // Apply time filters
                        const matchesYear = targetYear === null || scheduleDate.getFullYear() === targetYear;
                        const matchesMonth = targetMonth === null || scheduleDate.getMonth() === targetMonth;
                        const matchesDate = !targetDate || scheduleDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0];

                        if (matchesYear && matchesMonth && matchesDate) {
                            schedule.shift_design.forEach(shift => {
                                schedules.push({
                                    employee_id: employee.id,
                                    employee_name: employee.name,
                                    department_name: department.name,
                                    date: scheduleDate,
                                    shift_code: shift.shift_code,
                                    position: shift.position,
                                    time_slot: shift.time_slot
                                });
                            });
                        }
                    });
                }
            });
        });

        if (schedules.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No schedules found for the specified criteria."
            });
        }

        res.status(OK).json({
            success: true,
            status: OK,
            message: schedules
        });
    } catch (err) {
        next(err);
    }
};

export const createMultipleDateDesignsByInhaber = async (req, res, next) => {
    const shiftCode = req.body.shift_code;
    const employeeID = req.query.employeeID;
    const departmentName = req.query.department_name;
    const dates = req.body.dates;
    const inhaberName = req.query.inhaber_name;
    const convertToMinutes = (timeString) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    };
    const errorDates = [];
    try {
        // Fetch Inhaber and validate the department
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber || !inhaber.department.some(dep => dep.name === departmentName)) {
            return res.status(NOT_FOUND).json({ error: "Department not found or not managed by Inhaber" });
        }

        // Fetch the employee and verify the department
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee || !employee.department.some(dep => dep.name === departmentName)) {
            return res.status(NOT_FOUND).json({ error: "Employee not found in the specified department" });
        }

        const employeeDepartment = employee.department.find(dep => dep.name === departmentName);
        if (!employeeDepartment) return next(createError(NOT_FOUND, "Employee does not belong to the specified department!"));

        const shift = await ShiftSchema.findOne({ code: shiftCode });
        if (!shift) return res.status(NOT_FOUND).json({ error: "Shift not found" });

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
        const scheduleForDepartment = employee.department.find(dep => dep.name === departmentName).schedules;
        const responseMessage = {
            employee_id: employee.id,
            employee_name: employee.name,
            email: employee.email,
            schedule: scheduleForDepartment,
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
}

export const getDateDesignForInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const specificEmployeeID = req.query.employeeID;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const departmentNames = inhaber.department.map(dep => dep.name);
        const shiftDesigns = [];

        let employeeQuery = { 'department.name': { $in: departmentNames } };
        if (specificEmployeeID) {
            employeeQuery.id = specificEmployeeID; // Filter by specific employee ID if provided
        }

        const employees = await EmployeeSchema.find(employeeQuery);
        employees.forEach(employee => {
            employee.department.forEach(department => {
                if (departmentNames.includes(department.name)) {
                    department.schedules.forEach(schedule => {
                        const scheduleDate = new Date(schedule.date);

                        if ((!targetYear || scheduleDate.getFullYear() === targetYear) &&
                            (!targetMonth || scheduleDate.getMonth() === targetMonth) &&
                            (!targetDate || scheduleDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0])) {

                            schedule.shift_design.forEach(shift => {
                                shiftDesigns.push({
                                    employee_id: employee.id,
                                    employee_name: employee.name,
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
                }
            });
        });

        if (shiftDesigns.length === 0) {
            return next(createError(NOT_FOUND, "No shift designs found for the specified criteria in your department."));
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

export const deleteDateSpecificByInhaber = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const dateToDelete = new Date(req.body.date);
    const inhaber_name = req.query.inhaber_name;
    try {
        const inhaber = await AdminSchema.findOne({ name: inhaber_name });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        if (!employee.department_name.includes(inhaber.department_name)) {
            return next(createError(FORBIDDEN, "Permission denied. Inhaber can only modify schedules of an employee in their department."));
        }

        const specificDateSchedule = employee.schedules.find(schedule =>
            schedule.date.getTime() === dateToDelete.getTime()
        );

        if (!specificDateSchedule) {
            return next(createError(NOT_FOUND, "Date design not found!"));
        }

        specificDateSchedule.shift_design = specificDateSchedule.shift_design.filter(design =>
            design.department_name !== inhaber.department_name
        );

        if (specificDateSchedule.shift_design.length === 0) {
            const index = employee.schedules.indexOf(specificDateSchedule);
            employee.schedules.splice(index, 1);
        }

        await employee.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: "Shift design deleted successfully",
        });
    } catch (err) {
        next(err);
    }
};

export const getAttendanceForInhaber = async (req, res, next) => {
    const inhaber_name = req.query.inhaber_name;
    const employeeID = req.query.employeeID;
    const year = req.query.year;
    const month = req.query.month;
    const dateString = req.query.date;
    try {
        if (!inhaber_name) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Inhaber name is required",
            });
        }

        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        let dateRange = {};
        if (year && month) {
            let date = null;
            if (dateString) {
                date = new Date(dateString);
                if (isNaN(date.getTime())) {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: "Invalid date format",
                    });
                }
            }

            dateRange = date
                ? {
                    $gte: new Date(year, month - 1, date.getDate(), 0, 0, 0, 0),
                    $lt: new Date(year, month - 1, date.getDate() + 1, 0, 0, 0, 0),
                }
                : {
                    $gte: new Date(year, month - 1, 1),
                    $lt: new Date(year, month, 1),
                };
        }

        let query = {
            department_name: { $in: inhaber.department.map(dep => dep.name) }
        };

        if (Object.keys(dateRange).length > 0) {
            query.date = dateRange;
        }

        if (employeeID) {
            query.employee_id = employeeID;
        }

        const attendances = await AttendanceSchema.find(query);

        return res.status(OK).json({
            success: true,
            status: OK,
            message: attendances,
        });
    } catch (err) {
        next(err);
    }
};

export const getSalaryForInhaber = async (req, res, next) => {
    try {
        const { year, month, employeeID, department_name } = req.query;
        const inhaberName = req.query.inhaber_name;

        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) {
            return res.status(NOT_FOUND).json({ error: "Inhaber not found" });
        }

        let query = {};
        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);

        let isInhaberDepartment = department_name ? inhaber.department.some(dep => dep.name === department_name) : false;

        let employeeIds = [];
        if (department_name && isInhaberDepartment) {
            const employeesInDepartment = await EmployeeSchema.find({ 'department.name': department_name }).select('id');
            employeeIds = employeesInDepartment.map(employee => employee.id);
        } else if (!department_name) {
            const employeesInInhaberDepartment = await EmployeeSchema.find({ 'department.name': { $in: inhaber.department.map(dep => dep.name) } }).select('id');
            employeeIds = employeesInInhaberDepartment.map(employee => employee.id);
        }

        if (employeeID) {
            // Check if employeeID is in one of the Inhaber's departments
            const isEmployeeInInhaberDepartment = employeeIds.includes(employeeID);
            if (!isEmployeeInInhaberDepartment) {
                return res.status(NOT_FOUND).json({ error: "Employee not found in Inhaber's departments" });
            }
            query.employee_id = employeeID;
        } else {
            query.employee_id = { $in: employeeIds };
        }

        const salaries = await SalarySchema.find(query);
        if (salaries.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No salary records found for the provided criteria."
            });
        }

        return res.status(OK).json({
            success: true,
            status: OK,
            message: salaries
        });
    } catch (err) {
        next(err);
    }
};

export const getAllRequestsForInhaber = async (req, res, next) => {
    const inhaber_name = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const departmentNames = inhaber.department.map(dep => dep.name);
        const employeesInDepartment = await EmployeeSchema.find({ 'department.name': { $in: departmentNames } });
        const employeeIds = employeesInDepartment.map(emp => emp.id);

        const requests = await RequestSchema.find({ employee_id: { $in: employeeIds } });

        return res.status(OK).json({
            success: true,
            status: OK,
            message: requests,
        });
    } catch (err) {
        next(err);
    }
};

export const getRequestByIdForInhaber = async (req, res, next) => {
    const inhaber_name = req.query.inhaber_name;
    const requestId = req.params._id;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const request = await RequestSchema.findById(requestId).populate('employee_id');
        if (!request) return next(createError(NOT_FOUND, "Request not found!"));

        const departmentNames = inhaber.department.map(dep => dep.name);
        if (!departmentNames.includes(request.employee_id.department.name)) {
            return next(createError(NOT_FOUND, "Request not made by an employee in Inhaber's department"));
        }

        return res.status(OK).json({
            success: true,
            status: OK,
            message: request,
        });
    } catch (err) {
        next(err);
    }
};

export const handleRequestForInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const updateRequest = await RequestSchema.findOneAndUpdate(
            { _id: req.params._id },
            { $set: { answer_status: req.body.answer_status } },
            { new: true }
        );
        if (!updateRequest) return next(createError(NOT_FOUND, "Request not found!"));

        const employee = await EmployeeSchema.findOne({ id: updateRequest.employee_id });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        // Check if the employee is in one of the Inhaber's departments
        const isEmployeeInInhaberDepartment = employee.department.some(dept =>
            inhaber.department.some(inhaberDept => inhaberDept.name === dept.name)
        );
        if (!isEmployeeInInhaberDepartment) {
            return next(createError(FORBIDDEN, "You do not have permission to handle requests for this employee."));
        }

        const dayOffRequest = await DayOffSchema.findOne({
            date_start: new Date(updateRequest.request_dayOff_start),
            date_end: new Date(updateRequest.request_dayOff_end),
        });
        if (!dayOffRequest) return next(createError(NOT_FOUND, "Day Off request not found!"));

        if (updateRequest.answer_status === "approved") {
            dayOffRequest.allowed = true;
            await dayOffRequest.save();
            const employeeDayOff = employee.dayOff_schedule.find(dayOffSchedule =>
                dayOffSchedule.date_start.getTime() === dayOffRequest.date_start.getTime() &&
                dayOffSchedule.date_end.getTime() === dayOffRequest.date_end.getTime()
            );

            if (employeeDayOff) {
                employeeDayOff.allowed = true;
                employee.realistic_day_off = employee.realistic_day_off - dayOffRequest.duration;

                employee.markModified('dayOff_schedule');
                await employee.save();
            }
        } else if (updateRequest.answer_status === "denied") {
            employee.dayOff_schedule = employee.dayOff_schedule.filter(dayOffSchedule =>
                dayOffSchedule.date_start.getTime() !== dayOffRequest.date_start.getTime() ||
                dayOffSchedule.date_end.getTime() !== dayOffRequest.date_end.getTime()
            );
            await employee.save();
            await DayOffSchema.findOneAndDelete({ _id: dayOffRequest._id });
        }

        res.status(OK).json({
            success: true,
            status: OK,
            message: updateRequest,
        });
    } catch (err) {
        next(err);
    }
};

export const updateAttendanceForInhaber = async (req, res, next) => {
    const attendanceId = req.params._id;
    const inhaber_name = req.query.inhaber_name;
    const updateData = req.body;
    try {
        const attendance = await AttendanceSchema.findById(attendanceId);
        if (!attendance) return next(createError(NOT_FOUND, "Attendance record not found."));

        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: 'Inhaber' });
        if (!inhaber || !inhaber.department.some(dep => dep.name === attendance.department_name)) {
            return next(createError(FORBIDDEN, "Inhaber does not have access to this department."));
        }

        const currentTime = new Date();
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;
        const edited = await EmployeeSchema.findOne({ id: attendance.employee_id });

        const departmentIndex = edited.department.findIndex(dep => dep.name === attendance.department_name);
        const statsIndex = edited.department[departmentIndex].attendance_stats.findIndex(stat =>
            stat.year === currentYear && stat.month === currentMonth
        );

        const attendanceTotalHours = attendance.shift_info.total_hour;
        const attendanceTotalMinutes = attendance.shift_info.total_minutes;
        const attendance_total_times = attendanceTotalHours + attendanceTotalMinutes / 60;
        if (attendance.status === "checked") {
            if (attendance.shift_info.time_slot.check_in_status === "on time" && attendance.shift_info.time_slot.check_out_status === "on time") {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_on_time -= 1;
            } else if (attendance.shift_info.time_slot.check_in_status === "late" && attendance.shift_info.time_slot.check_out_status === "late") {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_late -= 1;
            } else if ((attendance.shift_info.time_slot.check_in_status === "late" && attendance.shift_info.time_slot.check_out_status === "on time")
                || (attendance.shift_info.time_slot.check_in_status === "on time" && attendance.shift_info.time_slot.check_out_status === "late")) {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_on_time -= 0.5;
                edited.department[departmentIndex].attendance_stats[statsIndex].date_late -= 0.5;
            }
        } else {
            edited.department[departmentIndex].attendance_stats[statsIndex].date_missing += 1;
        }

        const updatedFields = {};
        for (const key in updateData) {
            if (updateData.hasOwnProperty(key)) {
                if (typeof updateData[key] === 'object' && updateData[key] !== null) {
                    for (const subKey in updateData[key]) {
                        updatedFields[`${key}.${subKey}`] = updateData[key][subKey];
                    }
                } else {
                    updatedFields[key] = updateData[key];
                }
            }
        }

        const updatedAttendance = await AttendanceSchema.findByIdAndUpdate(
            attendanceId,
            { $set: updatedFields },
            { new: true }
        );

        const updatedCheckInTimeString = updatedAttendance.shift_info.time_slot.check_in_time;
        const updatedCheckInTime = new Date(`${updatedAttendance.date.toDateString()} ${updatedCheckInTimeString}`);

        const updatedCheckOutTimeString = updatedAttendance.shift_info.time_slot.check_out_time;
        const updatedCheckOutTime = new Date(`${updatedAttendance.date.toDateString()} ${updatedCheckOutTimeString}`);

        const updatedTimeDifference = updatedCheckOutTime - updatedCheckInTime;
        const updatedTotalHours = Math.floor(updatedTimeDifference / (1000 * 60 * 60));
        const updatedTotalMinutes = Math.floor((updatedTimeDifference % (1000 * 60 * 60)) / (1000 * 60));
        updatedAttendance.shift_info.total_hour = updatedTotalHours;
        updatedAttendance.shift_info.total_minutes = updatedTotalMinutes;
        const update_total_times = updatedTotalHours + updatedTotalMinutes / 60;

        if (updatedAttendance.status === "checked") {
            if (updatedAttendance.shift_info.time_slot.check_in_status === "on time" && updatedAttendance.shift_info.time_slot.check_out_status === "on time") {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 1;
            } else if (updatedAttendance.shift_info.time_slot.check_in_status === "late" && updatedAttendance.shift_info.time_slot.check_out_status === "late") {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_late += 1;
            } else if ((updatedAttendance.shift_info.time_slot.check_in_status === "late" && updatedAttendance.shift_info.time_slot.check_out_status === "on time")
                || (updatedAttendance.shift_info.time_slot.check_in_status === "on time" && updatedAttendance.shift_info.time_slot.check_out_status === "late")) {
                edited.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 0.5;
                edited.department[departmentIndex].attendance_stats[statsIndex].date_late += 0.5;
            }
        } else {
            edited.department[departmentIndex].attendance_stats[statsIndex].date_missing += 1;
        }
        await updatedAttendance.save();

        let stats = await StatsSchema.findOne({
            employee_id: edited.id,
            year: currentYear,
            month: currentMonth
        });
        stats.attendance_total_times = stats.attendance_total_times - attendance_total_times + update_total_times;
        stats.attendance_overtime = stats.attendance_total_times - stats.default_schedule_times;
        await stats.save();

        const newLog = new LogSchema({
            year: currentYear,
            month: currentMonth,
            date: currentTime,
            type_update: "Update attendance",
            editor_name: inhaber.name,
            editor_role: inhaber.role,
            edited_name: edited.name,
            edited_role: edited.role,
            detail_update: req.body,
            object_update: attendance
        })
        await newLog.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: updatedAttendance,
            log: newLog
        });
    } catch (err) {
        next(err);
    }
};

export const getStatsForInhaber = async (req, res, next) => {
    try {
        const { year, month, employeeID, department_name } = req.query;
        const inhaberName = req.query.inhaber_name;
        let query = {};

        // Fetch Inhaber and their departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) {
            return res.status(NOT_FOUND).json({ error: "Inhaber not found" });
        }
        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);

        let employeeIds = [];
        if (department_name) {
            if (!inhaberDepartments.includes(department_name)) {
                return res.status(NOT_FOUND).json({ error: "Department not managed by Inhaber" });
            }
            const employees = await EmployeeSchema.find({ 'department.name': department_name });
            employeeIds = employees.map(emp => emp.id);
        } else {
            // Get all employees from Inhaber's departments
            const employees = await EmployeeSchema.find({ 'department.name': { $in: inhaberDepartments } });
            employeeIds = employees.map(emp => emp.id);
        }

        if (employeeID) {
            if (!employeeIds.includes(employeeID)) {
                return res.status(NOT_FOUND).json({ error: "Employee not found in Inhaber's departments" });
            }
            employeeIds = [employeeID];
        }

        if (employeeIds.length > 0) {
            query.employee_id = { $in: employeeIds };
        }

        const stats = await StatsSchema.find(query);
        if (stats.length === 0) {
            return res.status(NOT_FOUND).json({ success: false, status: NOT_FOUND, message: "Statistics not found." });
        }

        return res.status(OK).json({ success: true, status: OK, message: stats });
    } catch (err) {
        next(err);
    }
};

export const addMemberToDepartmentByInhaber = async (req, res, next) => {
    const departmentName = req.params.name;
    const employeeID = req.body.employeeID;
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        // Check if the department is managed by the Inhaber
        if (!inhaber.department.some(dep => dep.name === departmentName)) {
            return next(createError(FORBIDDEN, "You do not have permission to add members to this department."));
        }

        const department = await DepartmentSchema.findOne({ name: departmentName });
        if (!department) return next(createError(NOT_FOUND, "Department not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        if (department.members.includes(employee)) return next(createError(CONFLICT, "Employee already exists in the department!"));

        const departmentObject = {
            name: departmentName,
            position: req.body.position
        };

        department.members.push({
            id: employee.id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            position: departmentObject.position,
            status: employee.status
        });
        employee.department.push(departmentObject);

        await department.save();
        await employee.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: "Member added to department successfully."
        });
    } catch (err) {
        next(err);
    }
};

export const removeMemberFromDepartmentByInhaber = async (req, res, next) => {
    const departmentName = req.params.name;
    const employeeID = req.body.employeeID;
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: 'Inhaber' });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        // Check if the department is managed by the Inhaber
        if (!inhaber.department.some(dep => dep.name === departmentName)) {
            return next(createError(FORBIDDEN, "You do not have permission to remove members from this department."));
        }

        const department = await DepartmentSchema.findOne({ name: departmentName });
        if (!department) return next(createError(NOT_FOUND, "Department not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        if (!department.members.some(member => member.id === employeeID)) {
            return next(createError(NOT_FOUND, "Employee not a member of the department."));
        }

        department.members = department.members.filter(member => member.id !== employeeID);
        employee.department = employee.department.filter(dep => dep.name !== departmentName);

        await department.save();
        await employee.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: "Member removed from department successfully."
        });
    } catch (err) {
        next(err);
    }
};

export const getFormByInhaber = async (req, res, next) => {
    const { year, month, employeeID, department_name, position, inhaber_name } = req.query;
    try {
        // Find the Inhaber and their departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: 'Inhaber' });
        if (!inhaber) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "Inhaber not found."
            });
        }

        // Extract the department names of the Inhaber
        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        let query = {};

        // Time query
        if (year) {
            const startDate = new Date(year, month ? month - 1 : 0, 1);
            const endDate = new Date(year, month ? month : 12, 0);
            query.date = { $gte: startDate, $lt: endDate };
        }

        // Employee query
        if (employeeID) {
            const employee = await EmployeeSchema.findOne({ id: employeeID });
            if (!employee || !employee.department.some(dep => inhaberDepartments.includes(dep.name))) {
                return res.status(NOT_FOUND).json({
                    success: false,
                    status: NOT_FOUND,
                    message: "Employee not found or not in Inhaber's department."
                });
            }
            query.employee_id = employeeID;
        }

        // Department query
        if (department_name) {
            if (!inhaberDepartments.includes(department_name)) {
                return res.status(NOT_FOUND).json({
                    success: false,
                    status: NOT_FOUND,
                    message: "Department not in Inhaber's department."
                });
            }
            query.department_name = department_name;
        } else {
            query.department_name = { $in: inhaberDepartments };
        }

        if (position && ['Autofahrer', 'Service', 'Lito'].includes(position)) {
            query.position = position;
        } else if (position) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Invalid position value."
            });
        }

        // Find attendance records
        const attendanceRecords = await AttendanceSchema.find(query);

        if (attendanceRecords.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No attendance records found."
            });
        }

        // Format the results
        const formattedResults = formatAttendanceResults(attendanceRecords);

        return res.status(OK).json({
            success: true,
            status: OK,
            message: formattedResults
        });
    } catch (err) {
        next(err);
    }
};

function formatAttendanceResults(attendanceRecords) {
    return attendanceRecords.map(record => {
        let result = {
            date: record.date,
            employee_id: record.employee_id,
            employee_name: record.employee_name,
            department_name: record.department_name,
            position: record.position,
        };

        switch (record.position) {
            case "Autofahrer":
                return {
                    ...result,
                    car_info: record.car_info,
                    check_in_km: record.check_in_km,
                    check_out_km: record.check_out_km,
                    total_km: record.total_km
                };
            case "Service":
                return {
                    ...result,
                    bar: record.bar,
                    gesamt: record.gesamt,
                    trinked_ec: record.trinked_ec,
                    trink_geld: record.trink_geld,
                    auf_rechnung: record.auf_rechnung,
                    results: record.results
                };
            case "Lito":
                return {
                    ...result,
                    bar: record.bar,
                    kredit_karte: record.kredit_karte,
                    kassen_schniff: record.kassen_schniff,
                    gesamt_ligerbude: record.gesamt_ligerbude,
                    gesamt_liegerando: record.gesamt_liegerando,
                    results: record.results
                };
        }
        return result;
    });
}

export const createCarByInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    const carDepartmentNames = req.body.department_name;
    try {
        // Check if Inhaber exists and get their departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        // Filter departments managed by Inhaber
        const validDepartments = inhaber.department.map(dep => dep.name);
        const departmentsToManage = carDepartmentNames.filter(name => validDepartments.includes(name));

        const departments = await DepartmentSchema.find({
            name: { $in: departmentsToManage }
        });

        if (!departments || departments.length === 0) {
            return next(createError(NOT_FOUND, "One or more departments not found or not managed by Inhaber!"));
        }

        const newCar = new CarSchema({
            ...req.body,
            department_name: carDepartmentNames,
            register_date: new Date(req.body.register_date)
        });

        for (const department of departments) {
            department.cars.push({
                name: newCar.car_name,
                number: newCar.car_number,
                department_name: department.name,
                register_date: newCar.register_date
            });
            await department.save();
        }

        await newCar.save();
        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newCar,
        });
    } catch (err) {
        next(err);
    }
}

export const getCarByInhaber = async (req, res, next) => {
    const { inhaber_name, car_name, car_number, department_name } = req.query;
    try {
        // Validate Inhaber and get their departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaber_name, role: "Inhaber" });
        if (!inhaber) {
            return next(createError(NOT_FOUND, "Inhaber not found!"));
        }

        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        // Build query based on Inhaber's departments
        let query = {
            'department_name': { $in: inhaberDepartments }
        };
        if (car_number) query['car_number'] = { $regex: new RegExp(car_number, 'i') };
        if (car_name) query['car_name'] = { $regex: new RegExp(car_name, 'i') };
        if (department_name && inhaberDepartments.includes(department_name)) {
            query['department_name'] = department_name;
        }

        const cars = await CarSchema.find(query);
        if (!cars || cars.length === 0) {
            return next(createError(NOT_FOUND, "No cars found."));
        }

        return res.status(OK).json({
            success: true,
            status: OK,
            message: cars,
        });
    } catch (err) {
        next(err);
    }
};

export const updateCarByInhaber = async (req, res, next) => {
    const { car_number } = req.params;
    const inhaberName = req.query.inhaber_name;
    try {
        // Validate Inhaber and get their departments
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        // Find the car and validate if it belongs to Inhaber's departments
        const car = await CarSchema.findOne({ car_number: car_number });
        if (!car) return next(createError(NOT_FOUND, "Car not found!"));

        if (!inhaberDepartments.includes(car.department_name)) {
            return next(createError(FORBIDDEN, "Access denied to modify car in this department."));
        }

        // Updating car details
        Object.assign(car, req.body);
        await car.save();

        // Reflect changes in departments
        const departments = await DepartmentSchema.find({
            'cars.number': car_number,
            'name': { $in: inhaberDepartments }
        });

        for (const department of departments) {
            const carIndex = department.cars.findIndex(c => c.number === car_number);
            if (carIndex !== -1) {
                department.cars[carIndex] = {
                    name: car.car_name,
                    number: car.car_number,
                    department_name: department.name,
                    register_date: car.register_date
                };
                await department.save();
            }
        }

        return res.status(OK).json({
            success: true,
            status: OK,
            message: car,
        });
    } catch (err) {
        next(err);
    }
};

export const deleteCarByInhaber = async (req, res, next) => {
    const { car_number } = req.params;
    const inhaberName = req.query.inhaber_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        const inhaberDepartments = inhaber.department.map(dep => dep.name);

        const car = await CarSchema.findOne({ car_number: car_number });
        if (!car) return next(createError(NOT_FOUND, "Car not found!"));

        if (!inhaberDepartments.includes(car.department_name)) {
            return next(createError(FORBIDDEN, "Access denied to delete car in this department."));
        }

        const departments = await DepartmentSchema.find({
            'cars.number': car_number,
            'name': { $in: inhaberDepartments }
        });

        for (const department of departments) {
            department.cars = department.cars.filter(c => c.number !== car_number);
            await department.save();
        }

        await CarSchema.findOneAndDelete({ car_number: car_number });

        return res.status(OK).json({
            success: true,
            status: OK,
            message: `Car ${car_number} deleted successfully`,
        });
    } catch (err) {
        next(err);
    }
};