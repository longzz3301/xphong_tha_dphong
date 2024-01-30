import { createError } from "../utils/error.js";
import { BAD_REQUEST, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import AttendanceSchema from "../models/AttendanceSchema.js";
import AdminSchema from "../models/AdminSchema.js";
import DepartmentSchema from "../models/DepartmentSchema.js";
import RequestSchema from "../models/RequestSchema.js";
import DayOffSchema from "../models/DayOffSchema.js";
import cron from 'node-cron';
import StatsSchema from "../models/StatsSchema.js";
import LogSchema from "../models/LogSchema.js";

// ? 
export const updateEmployee = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    // const editor_name = req.query.editor_name;
    try {
        const currentTime = new Date();
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;
        // const editor = await AdminSchema.findOne({ name: editor_name });

        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) {
            return next(createError(NOT_FOUND, "Employee not found!"));
        }

        if (employee.status === "inactive") {
            return next(createError(NOT_FOUND, "Employee not active!"));
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
                // const spendSchedulesTime = stats.default_schedule_times - stats.realistic_schedule_times;
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
        await updatedEmployee.save();

        res.status(OK).json({
            success: true,
            status: OK,
            message: updatedEmployee,
        });
    } catch (err) {
        next(err);
    }
};

// export const madeEmployeeInactive = async (req, res, next) => {
//     const employeeID = req.query.employeeID;
//     try {
//         const employee = await EmployeeSchema.findOne({ id: employeeID });
//         if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
//         if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee already inactive!"));

//         const [month, day, year] = req.body.inactive_day.split('/').map(Number);
//         const inactiveDate = new Date(year, month - 1, day);
//         // console.log(inactiveDate);
//         const currentDate = new Date();

//         // Check if the inactive date is in the future
//         if (inactiveDate <= currentDate) {
//             return next(createError(BAD_REQUEST, "Inactive day must be in the future."));
//         }

//         // Schedule the status update to run at midnight (00:00) of the specified date
//         cron.schedule(`0 0 ${day} ${month} *`, async () => {
//             employee.inactive_day = inactiveDate;
//             employee.status = "inactive";

//             // Update status in departments
//             for (let departmentObject of employee.department) {
//                 const department = await DepartmentSchema.findOne({ name: departmentObject.name });
//                 if (department) {
//                     const memberIndex = department.members.findIndex(member => member.id === employee.id);
//                     if (memberIndex !== -1) {
//                         department.members[memberIndex].status = "inactive";
//                         await department.save();
//                     }
//                 }
//             }

//             // Update status in day off records
//             await DayOffSchema.updateMany(
//                 { 'members.id': employeeID },
//                 { $set: { 'members.$.status': "inactive" } }
//             );

//             await employee.save();
//         });

//         res.status(OK).json({
//             success: true,
//             status: OK,
//             message: `Employee will be made inactive on the specified date: ${inactiveDate}.`
//         });
//     } catch (err) {
//         next(err);
//     }
// };

// get list nhân viên done  
export const getEmployeeById = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        res.status(OK).json({
            success: true,
            status: OK,
            message: [employee],
        });
    } catch (err) {
        next(err);
    }
};


// delete nhân viên done 
export const deleteEmployeeById = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        // Remove the employee from all departments
        for (let departmentObject of employee.department) {
            const department = await DepartmentSchema.findOne({ name: departmentObject.name });
            if (department) {
                department.members = department.members.filter(member => member.id !== employee.id);
                await department.save();
            }
        }

        // Remove the employee from all day off records
        await DayOffSchema.updateMany(
            { 'members.id': employeeID },
            { $pull: { members: { id: employeeID } } }
        );

        // Finally, delete the employee record
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


// search employee , Inhaber , Manager theo bộ lọc // details . done 
export const searchSpecific = async (req, res, next) => {
    const { role, department, details, status } = req.query;
    try {
        const regex = new RegExp(details, 'i'); // ?
        let managementQueryCriteria = {};
        let employeeQueryCriteria = {};

        if (role) {
            if (role === 'Employee') {
                managementQueryCriteria = null;
                employeeQueryCriteria['role'] = 'Employee';
            } else {
                managementQueryCriteria['role'] = role;
                employeeQueryCriteria['role'] = role; 
            }
        } else {
            managementQueryCriteria['role'] = { $in: ['Inhaber', 'Manager'] };
            employeeQueryCriteria['role'] = 'Employee';
        }

        if (status) {
            if (managementQueryCriteria) managementQueryCriteria['status'] = status;
            employeeQueryCriteria['status'] = status;
        }

        if (details) {
            if (managementQueryCriteria) {
                managementQueryCriteria['$or'] = [{ id: regex }, { name: regex }];
            }
            employeeQueryCriteria['$or'] = [{ id: regex }, { name: regex }, { 'department.position': regex }];
        }

        if (department) {
            if (managementQueryCriteria) managementQueryCriteria['department_name'] = department;
            employeeQueryCriteria['department.name'] = department;
        }

        let managements = [];
        let employees = [];

        if (managementQueryCriteria) {
            managements = await EmployeeSchema.find(managementQueryCriteria);
        }
        if (Object.keys(employeeQueryCriteria).length > 0) {
            employees = await EmployeeSchema.find(employeeQueryCriteria);
        }

        const result = [...managements, ...employees];

        if (result.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No matching records found.",
            });
        }

        res.status(OK).json({
            success: true,
            status: OK,
            message: result,
        });
    } catch (err) {
        next(err);
    }
};


// trang dash board get employee working để xem nhưng nhân viên có ca làm hôm đó và hiển thị thời gian ca làm  (lọc theo ngày và depar)
// get lọc theo năm tháng ngày , deparment =>  querry theo employee schema  
export const getAllEmployeesSchedules = async (req, res, next) => {
    const targetYear = req.query.year ? parseInt(req.query.year) : null;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : null; 
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const departmentFilter = req.query.department_name;
    try {
        const employees = await EmployeeSchema.find();
        const schedules = [];

        employees.forEach(employee => {
            employee.department.forEach(department => {
                if ( department.name === departmentFilter) { 
                    department.schedules.forEach(schedule => {
                        const scheduleDate = new Date(schedule.date);

                        // Check if the schedule matches the time criteria
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
                                    time_slot: shift.time_slot,
                                    shift_type: shift.shift_type
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

// dash board này lọc theo ngày và depart sau đó trả ra list nvien trong ca đó và list nhân viên đã điểm danh dưới 
// get  attend của nhaan vien   querry the0 attendance schema lọc theo ngày và depa 
export const getAttendance = async (req, res, next) => {
    try {
        const employeeID = req.query.employeeID;
        const departmentName = req.query.department_name;
        const year = req.query.year;
        const month = req.query.month;
        const dateString = req.query.date;

        let date = null;
        let dateRange = {};

        if (year && month) {
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

            dateRange = date //  
                ? {
                    $gte: new Date(year, month - 1, date.getDate(), 0, 0, 0, 0),
                    $lt: new Date(year, month - 1, date.getDate() + 1, 0, 0, 0, 0),
                }
                : {
                    $gte: new Date(year, month - 1, 1),
                    $lt: new Date(year, month, 1),
                };
        }
        console.log("dateRange :" , dateRange)

        let query = {};
        if (Object.keys(dateRange).length > 0) {
            query.date = dateRange;
        }

        if (employeeID) {
            query.employee_id = employeeID;
        }

        if (departmentName) {
            query['department_name'] = departmentName;
        }

        console.log("query" , query)
        // Execute the query
        const attendances = await AttendanceSchema.find(query).lean();
        console.log("attendances" , attendances)

        return res.status(OK).json({
            success: true,
            status: OK,
            message: attendances,
        });
    } catch (err) {
        next(err);
    }
};

export const getAllRequests = async (req, res, next) => {
    try {
        const requests = await RequestSchema.find();
        return res.status(OK).json({
            success: true,
            status: OK,
            message: requests,
        });
    } catch (err) {
        next(err);
    }
};

export const getRequestById = async (req, res, next) => {
    try {
        const request = await RequestSchema.find({ _id: req.params._id });
        if (!request) return next(createError(NOT_FOUND, "Request not found!"));

        return res.status(OK).json({
            success: true,
            status: OK,
            message: request,
        });
    } catch (err) {
        next(err);
    }
};

export const handleRequest = async (req, res, next) => {
    try {
        const updateRequest = await RequestSchema.findOneAndUpdate(
            { _id: req.params._id },
            { $set: { answer_status: req.body.answer_status } },
            { new: true }
        );
        if (!updateRequest) return next(createError(NOT_FOUND, "Request not found!"));

        const day_off = await DayOffSchema.findOne({
            date_start: new Date(updateRequest.request_dayOff_start),
            date_end: new Date(updateRequest.request_dayOff_end),
        });
        if (!day_off) return next(createError(NOT_FOUND, "Day Off not found!"));

        const employee = await EmployeeSchema.findOne({ id: updateRequest.employee_id });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        if (updateRequest.answer_status === "approved") {
            day_off.allowed = true;
            await day_off.save();
            const employeeDayOff = employee.dayOff_schedule.find(dayOffSchedule =>
                dayOffSchedule.date_start.getTime() === day_off.date_start.getTime() &&
                dayOffSchedule.date_end.getTime() === day_off.date_end.getTime()
            );

            employeeDayOff.allowed = true;
            employee.realistic_day_off = employee.realistic_day_off - day_off.duration;

            employee.markModified('dayOff_schedule');
            await employee.save();
        } else if (updateRequest.answer_status === "denied") {
            employee.dayOff_schedule = employee.dayOff_schedule.filter(dayOffSchedule =>
                dayOffSchedule.date_start.getTime() !== day_off.date_start.getTime() ||
                dayOffSchedule.date_end.getTime() !== day_off.date_end.getTime()
            );
            await employee.save();
            await DayOffSchema.findOneAndDelete({ _id: req.params._id });
        }
        res.status(OK).json({
            success: true,
            status: OK,
            message: updateRequest,
        });
    } catch (err) {
        next(err);
    }
}

export const getStats = async (req, res, next) => {
    try {
        const { year, month, employeeID, department_name } = req.query;
        let query = {};

        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);

        let employeeIds = [];
        if (department_name) {
            const employees = await EmployeeSchema.find({ 'department.name': department_name });
            employeeIds = employees.map(emp => emp.id);
        }

        if (employeeID) {
            if (department_name) {
                employeeIds = employeeIds.filter(id => id === employeeID);
                if (employeeIds.length === 0) {
                    return res.status(NOT_FOUND).json({
                        success: false,
                        status: NOT_FOUND,
                        message: "No matching statistics found.",
                    });
                }
            } else {
                employeeIds = [employeeID];
            }
        }

        // Add employee_id to the query if there are any IDs to query
        if (employeeIds.length > 0) {
            query.employee_id = { $in: employeeIds };
        }

        // Find stats with the constructed query
        const stats = await StatsSchema.find(query);

        if (!stats || stats.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "Statistics not found.",
            });
        }

        return res.status(OK).json({
            success: true,
            status: OK,
            message: stats,
        });
    } catch (err) {
        next(err);
    }
};

export const updateAttendance = async (req, res, next) => {
    const attendanceId = req.params._id;
    const editor_name = req.query.editor_name;
    const updateData = req.body;
    try {
        const attendance = await AttendanceSchema.findById(attendanceId);
        if (!attendance) {
            return next(createError(NOT_FOUND, "Attendance record not found."));
        }

        const currentTime = new Date();
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;
        const editor = await AdminSchema.findOne({ name: editor_name });
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
            editor_name: editor.name,
            editor_role: editor.role,
            edited_name: edited.name,
            edited_role: edited.role,
            before_update: attendance,
            after_update: updatedAttendance
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

export const getLogs = async (req, res, next) => {
    try {
        const { year, month, date, editor_name, editor_role, edited_name, edited_role,
            type_update, department_name } = req.query;

        let query = {};

        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);
        if (date) query.date = new Date(date);
        if (editor_name) query.editor_name = editor_name;
        if (editor_role) query.editor_role = editor_role;
        if (edited_name) query.edited_name = edited_name;
        if (edited_role) query.edited_role = edited_role;
        if (type_update) query.type_update = type_update;

        // Fetch the department if department_name is provided
        let departmentMembers = [];
        if (department_name) {
            const department = await DepartmentSchema.findOne({ name: department_name });
            if (!department) return next(createError(NOT_FOUND, "Department not found!"));
            departmentMembers = department.members.map(member => member.name);
            // console.log(departmentMembers);
        }

        let logs = await LogSchema.find(query);

        // Filter logs based on department members
        if (department_name) {
            logs = logs.filter(log =>
                departmentMembers.includes(log.editor_name) || departmentMembers.includes(log.edited_name)
            );
        }

        if (!logs || logs.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No logs found."
            });
        }

        res.status(OK).json({
            success: true,
            status: OK,
            message: logs
        });
    } catch (err) {
        next(err);
    }
};

export const getForm = async (req, res, next) => {
    const year = req.query.year;
    const month = req.query.month;
    const employeeID = req.query.employeeID;
    const department_name = req.query.department_name;
    const position = req.query.position;

    let query = {};

    // Time query
    if (year) {
        const startDate = new Date(year, month ? month - 1 : 0, 1);
        const endDate = new Date(year, month ? month : 12, 0);
        query.date = { $gte: startDate, $lt: endDate };
    }

    // Additional queries
    if (employeeID) query.employee_id = employeeID;
    if (department_name) query.department_name = department_name;

    if (position && ['Autofahrer', 'Service', 'Lito'].includes(position)) {
        query.position = position;
    } else if (position) {
        return res.status(BAD_REQUEST).json({
            success: false,
            status: BAD_REQUEST,
            message: "Invalid position value."
        });
    }

    try {
        const attendanceRecords = await AttendanceSchema.find(query);

        if (attendanceRecords.length === 0) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "No attendance records found."
            });
        }

        const formattedResults = attendanceRecords.map(record => {
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
                default:
                    return result;
            }
        });

        return res.status(OK).json({
            success: true,
            status: OK,
            message: formattedResults
        });
    } catch (err) {
        next(err);
    }
};






