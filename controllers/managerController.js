import { createError } from "../utils/error.js";
import { BAD_REQUEST, CONFLICT, CREATED, FORBIDDEN, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import AdminSchema from "../models/AdminSchema.js";
import ShiftSchema from "../models/ShiftSchema.js";
import AttendanceSchema from "../models/AttendanceSchema.js";
import StatsSchema from "../models/StatsSchema.js";
import DepartmentSchema from "../models/DepartmentSchema.js";

export const searchSpecificForManager = async (req, res, next) => {
    const { role, details, status } = req.query;
    const managerName = req.query.manager_name;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        const regex = new RegExp(details, 'i');
        const employeeQueryCriteria = {
            'department.name': { $in: manager.department.map(dep => dep.name) },
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

        // Filter out non-matching departments from each employee
        employees = employees.map(employee => {
            const filteredDepartments = employee.department.filter(dep =>
                manager.department.some(managerDep => managerDep.name === dep.name)
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
}

export const getEmployeeByIdForManager = async (req, res, next) => {
    const managerName = req.query.manager_name;
    const employeeID = req.query.employeeID;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        const isEmployeeInDepartment = employee.department.some(department =>
            manager.department.some(managerDepartment => managerDepartment.name === department.name)
        );

        if (!isEmployeeInDepartment) {
            return next(createError(FORBIDDEN, "Permission denied. manager can only access an employee in their departments."));
        }

        // Filter out non-matching departments from the employee
        const filteredDepartments = employee.department.filter(dep =>
            manager.department.some(managerDep => managerDep.name === dep.name)
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

export const getEmployeesSchedulesByManager = async (req, res, next) => {
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const managerName = req.query.manager_name;
    try {
        // Fetch manager and validate departments
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) {
            return res.status(NOT_FOUND).json({ error: "Manager not found" });
        }
        const managerDepartments = manager.department.map(dep => dep.name);

        // Fetch employees in manager's departments
        const employees = await EmployeeSchema.find({
            'department.name': { $in: managerDepartments }
        });

        const schedules = [];
        employees.forEach(employee => {
            employee.department.forEach(department => {
                if (managerDepartments.includes(department.name)) {
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
}

export const createMultipleDateDesignsByManager = async (req, res, next) => {
    const shiftCode = req.body.shift_code;
    const employeeID = req.query.employeeID;
    const departmentName = req.query.department_name;
    const dates = req.body.dates;
    const managerName = req.query.manager_name;
    const convertToMinutes = (timeString) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    };
    const errorDates = [];
    try {
        // Fetch manager and validate the department
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager || !manager.department.some(dep => dep.name === departmentName)) {
            return res.status(NOT_FOUND).json({ error: "Department not found or not managed by Manager" });
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

export const getDateDesignForManager = async (req, res, next) => {
    const managerName = req.query.manager_name;
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const specificEmployeeID = req.query.employeeID;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        const departmentNames = manager.department.map(dep => dep.name);
        const shiftDesigns = [];

        // Adjust the query to optionally include a specific employee ID
        let employeeQuery = { 'department.name': { $in: departmentNames } };
        if (specificEmployeeID) {
            employeeQuery.id = specificEmployeeID;
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

export const deleteDateSpecificByManager = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const dateToDelete = new Date(req.body.date);
    const manager_name = req.query.manager_name;
    try {
        const manager = await AdminSchema.findOne({ name: manager_name });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        if (!employee.department_name.includes(manager.department_name)) {
            return next(createError(FORBIDDEN, "Permission denied. manager can only modify schedules of an employee in their department."));
        }

        const specificDateSchedule = employee.schedules.find(schedule =>
            schedule.date.getTime() === dateToDelete.getTime()
        );

        if (!specificDateSchedule) {
            return next(createError(NOT_FOUND, "Date design not found!"));
        }

        // Filter out the shift design for the manager's department
        specificDateSchedule.shift_design = specificDateSchedule.shift_design.filter(design =>
            design.department_name !== manager.department_name
        );

        // If no shift designs remain for the date, remove the date itself
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

export const getAttendanceForManager = async (req, res, next) => {
    const manager_name = req.query.manager_name;
    const employeeID = req.query.employeeID;
    const year = req.query.year;
    const month = req.query.month;
    const dateString = req.query.date;

    try {
        if (!manager_name) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Manager name is required",
            });
        }

        const manager = await EmployeeSchema.findOne({ name: manager_name, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

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
            department_name: { $in: manager.department.map(dep => dep.name) }
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

export const addMemberToDepartmentByManager = async (req, res, next) => {
    const departmentName = req.params.name;
    const employeeID = req.body.employeeID;
    const managerName = req.query.manager_name;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        // Check if the department is managed by the manager
        if (!manager.department.some(dep => dep.name === departmentName)) {
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

export const removeMemberFromDepartmentByManager = async (req, res, next) => {
    const departmentName = req.params.name;
    const employeeID = req.body.employeeID;
    const managerName = req.query.manager_name;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        // Check if the department is managed by the manager
        if (!manager.department.some(dep => dep.name === departmentName)) {
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

export const getStatsForManager = async (req, res, next) => {
    try {
        const { year, month, employeeID, department_name } = req.query;
        const managerName = req.query.manager_name;
        let query = {};

        // Fetch manager and their departments
        const manager = await EmployeeSchema.findOne({ name: managerName, role: 'Manager' });
        if (!manager) {
            return res.status(NOT_FOUND).json({ error: "Manager not found" });
        }
        const managerDepartments = manager.department.map(dep => dep.name);

        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);

        let employeeIds = [];
        if (department_name) {
            if (!managerDepartments.includes(department_name)) {
                return res.status(NOT_FOUND).json({ error: "Department not managed by manager" });
            }
            const employees = await EmployeeSchema.find({ 'department.name': department_name });
            employeeIds = employees.map(emp => emp.id);
        } else {
            // Get all employees from manager's departments
            const employees = await EmployeeSchema.find({ 'department.name': { $in: managerDepartments } });
            employeeIds = employees.map(emp => emp.id);
        }

        if (employeeID) {
            if (!employeeIds.includes(employeeID)) {
                return res.status(NOT_FOUND).json({ error: "Employee not found in manager's departments" });
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
