import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../awsConfig.js";
import { BAD_REQUEST, CONFLICT, CREATED, FORBIDDEN, NOT_FOUND, OK, SYSTEM_ERROR } from "../constant/HttpStatus.js";
import AttendanceSchema from "../models/AttendanceSchema.js";
import CarSchema from "../models/CarSchema.js";
import DayOffSchema from "../models/DayOffSchema.js";
import DepartmentSchema from "../models/DepartmentSchema.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import RequestSchema from "../models/RequestSchema.js";
import StatsSchema from "../models/StatsSchema.js";
import { createError } from "../utils/error.js";
import wifi from 'node-wifi';

wifi.init({
    iface: null,
});

export const verifyWifi = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const department_name = req.query.department_name;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found"))

        const department = await DepartmentSchema.findOne({ name: department_name });
        if (!department) return next(createError(NOT_FOUND, "Department not found!"));
        // if (!department.members.includes(employee)) return next(createError(CONFLICT, "Employee not exists in the department!"));

        const currentConnections = await wifi.getCurrentConnections();
        // console.log(currentConnections);

        if (currentConnections.length > 0) {
            const connectedSSID = currentConnections[0].ssid;
            const allowedSSID = department.wifi_name;

            if (connectedSSID === allowedSSID) {
                // console.log(`Device connected to Wi-Fi with SSID: ${allowedSSID}`);
                res.status(OK).json({
                    success: true,
                    status: OK,
                    message: `Device connected to Wi-Fi with SSID: ${allowedSSID}`
                });
            } else {
                // console.log(`Device is not connected to the allowed Wi-Fi SSID.`);
                res.status(FORBIDDEN).json({
                    success: false,
                    status: FORBIDDEN,
                    message: `Device is not connected to the allowed Wi-Fi SSID.`
                });
            }
        } else {
            // console.log(`Device is not connected to any Wi-Fi network.`);
            res.status(FORBIDDEN).json({
                success: false,
                status: FORBIDDEN,
                message: `Device is not connected to any Wi-Fi network.`
            });
        }
    } catch (err) {
        console.error('Error checking Wi-Fi SSID:', err);
        next(err);
    }
}

export const collectIP = async (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    try {
        // console.log('User IP Address:', ip);
        return res.status(OK).json({
            success: true,
            status: OK,
            message: ip,
        });
    } catch (error) {
        console.log(error);
    }
}

export const autoCheck = async (req, res, next) => {
    try {
        const employees = await EmployeeSchema.find({ status: 'active' });
        for (const employee of employees) {
            await processEmployeeAttendance(employee);
        }
        console.log('Attendance processed successfully');
    } catch (error) {
        console.error('Error in processing attendance:', error);
    }
};

const processEmployeeAttendance = async (employee) => {
    const currentDateTime = new Date();
    const currentDate = currentDateTime.toDateString();
    let shiftProcessed = false;

    for (const department of employee.department) {
        for (const schedule of department.schedules) {
            if (schedule.date.toDateString() === currentDate) {
                await processScheduleShifts(employee, department, schedule, currentDateTime);
                shiftProcessed = true;
            }
        }
    }

    if (!shiftProcessed) {
        console.log('No matching shift design found for current time for employee:', employee.id);
    }
};

const processScheduleShifts = async (employee, department, schedule, currentDateTime) => {
    for (const shift of schedule.shift_design) {
        const shiftTimes = getShiftTimes(currentDateTime, shift.time_slot);
        if (isShiftTimeElapsed(shiftTimes, currentDateTime)) {
            await checkAndUpdateAttendance(employee, department, schedule, shift, shiftTimes);
        }
    }
};

const getShiftTimes = (currentDateTime, timeSlot) => {
    const [startHours, startMinutes] = timeSlot.start_time.split(':').map(Number);
    const [endHours, endMinutes] = timeSlot.end_time.split(':').map(Number);

    return {
        shiftStartTime: new Date(currentDateTime.getFullYear(), currentDateTime.getMonth(), currentDateTime.getDate(), startHours, startMinutes),
        shiftEndTime: new Date(currentDateTime.getFullYear(), currentDateTime.getMonth(), currentDateTime.getDate(), endHours, endMinutes),
        endHours, endMinutes
    };
};

const isShiftTimeElapsed = (shiftTimes, currentDateTime) => {
    const endTimePlus30 = new Date(shiftTimes.shiftEndTime);
    endTimePlus30.setMinutes(endTimePlus30.getMinutes() + 30);
    return currentDateTime > endTimePlus30;
};

const checkAndUpdateAttendance = async (employee, department, schedule, shift, shiftTimes) => {
    const existingAttendance = await AttendanceSchema.findOne({
        employee_id: employee.id,
        date: schedule.date,
        'shift_info.shift_code': shift.shift_code
    });

    if (!existingAttendance) {
        await createMissingAttendance(employee, department, schedule, shift);
    } else {
        await updateExistingAttendance(employee, department, existingAttendance, shiftTimes);
    }
};

const createMissingAttendance = async (employee, department, schedule, shift) => {
    const currentTime = new Date();
    const currentYear = currentTime.getFullYear();
    const currentMonth = currentTime.getMonth() + 1;
    const newAttendance = new AttendanceSchema({
        date: schedule.date,
        employee_id: employee.id,
        employee_name: employee.name,
        role: employee.role,
        department_name: department.name,
        position: employee.position,
        shift_info: {
            shift_code: shift.shift_code,
            total_hour: 0,
            total_minutes: 0,
        },
        check_in_km: 0,
        check_out_km: 0,
        total_km: 0,
        status: "missing",
    });
    const departmentIndex = employee.department.findIndex(dep => dep.name === department.name);
    const statsIndex = employee.department[departmentIndex].attendance_stats.findIndex(stat =>
        stat.year === currentYear && stat.month === currentMonth
    );

    if (statsIndex > -1) {
        employee.department[departmentIndex].attendance_stats[statsIndex].date_missing += 1;
    } else {
        const newStat = {
            year: currentYear,
            month: currentMonth,
            date_on_time: 0,
            date_late: 0,
            date_missing: 1,
        };
        employee.department[departmentIndex].attendance_stats.push(newStat);
    }
    await newAttendance.save();
    await employee.save();
    console.log('Missing attendance created for employee:', employee.id);

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
};

const updateExistingAttendance = async (employee, department, attendance, shiftTimes) => {
    const currentTime = new Date();
    const currentYear = currentTime.getFullYear();
    const currentMonth = currentTime.getMonth() + 1;
    if (attendance.shift_info.time_slot.check_in && !attendance.shift_info.time_slot.check_out) {
        const checkInTimeString = attendance.shift_info.time_slot.check_in_time;
        const checkInTime = new Date(`${currentTime.toDateString()} ${checkInTimeString}`);

        if (isNaN(checkInTime)) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: `Error parsing check-in time: ${checkInTimeString}`,
            });
        }
        // check out late
        attendance.shift_info.time_slot.check_out = true;
        attendance.shift_info.time_slot.check_out_time = `${shiftTimes.endHours}: ${shiftTimes.endMinutes}`;
        attendance.shift_info.time_slot.check_out_status = 'late';
        attendance.status = 'checked';
        const checkOutTimeString = attendance.shift_info.time_slot.check_out_time;
        const checkOutTime = new Date(`${currentTime.toDateString()} ${checkOutTimeString}`);

        if (isNaN(checkOutTime)) {
            // Handle the case where parsing fails
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: `Error parsing check-in time: ${checkOutTimeString}`,
            });
        }
        const timeDifference = checkOutTime - checkInTime;
        const totalHours = Math.floor(timeDifference / (1000 * 60 * 60));
        const totalMinutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
        attendance.shift_info.total_hour = totalHours;
        attendance.shift_info.total_minutes = totalMinutes;
        const total_times = totalHours + totalMinutes / 60;

        const departmentIndex = employee.department.findIndex(dep => dep.name === department.name);
        const statsIndex = employee.department[departmentIndex].attendance_stats.findIndex(stat =>
            stat.year === currentYear && stat.month === currentMonth
        );

        if (statsIndex > -1) {
            if (attendance.shift_info.time_slot.check_in_status = 'on time') {
                employee.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 0.5;
                employee.department[departmentIndex].attendance_stats[statsIndex].date_late += 0.5;
            } else {
                employee.department[departmentIndex].attendance_stats[statsIndex].date_late += 1;
            }
        } else {
            if (attendance.shift_info.time_slot.check_in_status = 'on time') {
                const newStat = {
                    year: currentYear,
                    month: currentMonth,
                    date_on_time: 0.5,
                    date_late: 0.5,
                    date_missing: 0,
                };
                employee.department[departmentIndex].attendance_stats.push(newStat);
            } else {
                const newStat = {
                    year: currentYear,
                    month: currentMonth,
                    date_on_time: 0,
                    date_late: 1,
                    date_missing: 0,
                };
                employee.department[departmentIndex].attendance_stats.push(newStat);
            }
        }
        await attendance.save();
        await employee.save();
        console.log('Attendance updated for employee:', attendance.employee_id);

        let stats = await StatsSchema.findOne({
            employee_id: employee.id,
            year: currentYear,
            month: currentMonth
        });
        if (stats) {
            stats.attendance_total_times = stats.attendance_total_times + total_times;
            stats.attendance_overtime = stats.attendance_total_times - stats.default_schedule_times;
            await stats.save();
        } else {
            console.log("Employee's stats not found");
        }
    } else {
        console.log('No update required for employee:', attendance.employee_id);
    }
};

export const checkAttendance = async (req, res, next) => {
    const employeeID = req.body.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found"));
        if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

        const currentTime = new Date();
        let currentShiftDesign = null;
        let currentDepartment = null;
        let currentDateDesign = null;

        // Iterate over each department to find schedule for current day
        for (const department of employee.department) {
            const dateDesign = department.schedules.find(schedule =>
                schedule.date.toDateString() === currentTime.toDateString()
            );

            if (dateDesign) {
                // Collect time ranges from shift_design
                for (const shift of dateDesign.shift_design) {
                    const [startHours, startMinutes] = shift.time_slot.start_time.split(':').map(Number);
                    const [endHours, endMinutes] = shift.time_slot.end_time.split(':').map(Number);

                    const shiftStartTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), startHours, startMinutes);
                    const shiftEndTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), endHours, endMinutes);
                    const endOfDay = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 23, 59, 59, 999);

                    const startTimeMinus30 = new Date(shiftStartTime);
                    startTimeMinus30.setMinutes(shiftStartTime.getMinutes() - 30);

                    const endTimePlus30 = new Date(shiftEndTime);
                    endTimePlus30.setMinutes(endTimePlus30.getMinutes() + 30);
                    if (shiftEndTime < endOfDay) {
                        // Compare currentTimestamp with the adjusted time range
                        if (currentTime.getTime() >= startTimeMinus30.getTime() && currentTime.getTime() <= endTimePlus30.getTime()) {
                            currentShiftDesign = shift;
                            currentDepartment = department.name;
                            currentDateDesign = dateDesign;
                            break;
                        }
                    } else {
                        return res.status(BAD_REQUEST).json({
                            success: false,
                            status: BAD_REQUEST,
                            message: `Err!`,
                        });
                    }
                }

                if (currentShiftDesign) {
                    break;
                }
            }
        }
        if (!currentShiftDesign) return next(createError(NOT_FOUND, 'No matching shift design found for current time'));

        // Check if attendance already exists for this shift on current day
        const existingAttendance = await AttendanceSchema.findOne({
            employee_id: employee.id,
            date: {
                $gte: new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 0, 0, 0, 0),
                $lt: new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), 23, 59, 59, 999),
            },
            'shift_info.shift_code': currentShiftDesign.shift_code,
        });

        const time_slot = currentShiftDesign.time_slot;
        if (!existingAttendance) {
            // only check in
            const newAttendance = new AttendanceSchema({
                date: currentDateDesign.date,
                employee_id: employeeID,
                employee_name: employee.name,
                role: employee.role,
                department_name: currentDepartment,
                position: currentShiftDesign.position,
                shift_info: {
                    shift_code: currentShiftDesign.shift_code,
                    shift_type: currentShiftDesign.shift_type,
                }
            });
            const [endHours, endMinutes] = time_slot.end_time.split(':').map(Number);
            const endTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), endHours, endMinutes);
            const [startHours, startMinutes] = time_slot.start_time.split(':').map(Number);
            const startTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), startHours, startMinutes);
            // Calculate startTime - 30 minutes
            const startTimeMinus30 = new Date(startTime);
            startTimeMinus30.setMinutes(startTime.getMinutes() - 30);

            // Calculate startTime
            const startTimeOrigin = new Date(startTime);
            startTimeOrigin.setMinutes(startTime.getMinutes());
            if (currentTime > startTimeMinus30 && currentTime < startTimeOrigin) {
                // check in on time
                newAttendance.shift_info.time_slot.check_in = true;
                newAttendance.shift_info.time_slot.check_in_time = `${currentTime.toLocaleTimeString()}`;
                newAttendance.shift_info.time_slot.check_in_status = 'on time';
                await newAttendance.save();
                return res.status(CREATED).json({
                    success: true,
                    status: CREATED,
                    message: newAttendance,
                    log: `${currentTime}`,
                });
            } else if (currentTime > startTimeOrigin && currentTime < endTime) {
                // check in late
                newAttendance.shift_info.time_slot.check_in = true;
                newAttendance.shift_info.time_slot.check_in_time = `${currentTime.toLocaleTimeString()}`;
                newAttendance.shift_info.time_slot.check_in_status = 'late';
                await newAttendance.save();
                return res.status(CREATED).json({
                    success: true,
                    status: CREATED,
                    message: newAttendance,
                    log: `${currentTime}`,
                });
            } else if (currentTime < startTimeMinus30) {
                // check in too soon
                return res.status(BAD_REQUEST).json({
                    success: false,
                    status: BAD_REQUEST,
                    message: `You can not check in at this time ${currentTime.toLocaleTimeString()}`,
                });
            }
        } else {
            // only check out
            if (existingAttendance.shift_info.time_slot.check_in != true) {
                return res.status(BAD_REQUEST).json({
                    success: false,
                    status: BAD_REQUEST,
                    message: "You haven't check in yet",
                });
            } else if (existingAttendance.shift_info.time_slot.check_in == true && existingAttendance.shift_info.time_slot.check_out != true) {
                const checkInTimeString = existingAttendance.shift_info.time_slot.check_in_time;
                const checkInTime = new Date(`${currentTime.toDateString()} ${checkInTimeString}`);
                if (isNaN(checkInTime)) {
                    // Handle the case where parsing fails
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: `Error parsing check-in time: ${checkInTimeString}`,
                    });
                }
                const [startHours, startMinutes] = time_slot.start_time.split(':').map(Number);
                const startTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), startHours, startMinutes);
                // const startTimeCheckIn = new Date(startTime);
                const [endHours, endMinutes] = time_slot.end_time.split(':').map(Number);
                const endTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), endHours, endMinutes);
                // Calculate endTime + 30 minutes
                const endTimePlus30 = new Date(endTime);
                endTimePlus30.setMinutes(endTime.getMinutes() + 30);
                const departmentIndex = employee.department.findIndex(dep => dep.name === currentDepartment);
                const currentYear = currentTime.getFullYear();
                const currentMonth = currentTime.getMonth() + 1;
                if (currentTime > startTime && currentTime < endTimePlus30) {
                    // check out on time
                    existingAttendance.shift_info.time_slot.check_out = true;
                    existingAttendance.shift_info.time_slot.check_out_time = `${currentTime.toLocaleTimeString()}`;
                    existingAttendance.shift_info.time_slot.check_out_status = 'on time';
                    existingAttendance.status = 'checked';
                    const timeDifference = currentTime - checkInTime;
                    const totalHours = Math.floor(timeDifference / (1000 * 60 * 60));
                    const totalMinutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
                    existingAttendance.shift_info.total_hour = totalHours;
                    existingAttendance.shift_info.total_minutes = totalMinutes;
                    await existingAttendance.save();

                    // Find the current year and month in attendance_stats of the department
                    const statsIndex = employee.department[departmentIndex].attendance_stats.findIndex(stat =>
                        stat.year === currentYear && stat.month === currentMonth
                    );

                    if (statsIndex > -1) {
                        if (existingAttendance.shift_info.time_slot.check_in_status === "on time") {
                            employee.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 1;
                        } else {
                            employee.department[departmentIndex].attendance_stats[statsIndex].date_on_time += 0.5;
                            employee.department[departmentIndex].attendance_stats[statsIndex].date_late += 0.5;
                        }
                    } else {
                        if (existingAttendance.shift_info.time_slot.check_in_status === "on time") {
                            const newStat = {
                                year: currentYear,
                                month: currentMonth,
                                date_on_time: 1,
                                date_late: 0,
                                date_missing: 0,
                            };
                            employee.department[departmentIndex].attendance_stats.push(newStat);
                        } else {
                            const newStat = {
                                year: currentYear,
                                month: currentMonth,
                                date_on_time: 0.5,
                                date_late: 0.5,
                                date_missing: 0,
                            };
                            employee.department[departmentIndex].attendance_stats.push(newStat);
                        }
                    }
                    await employee.save();
                    const total_times = totalHours + totalMinutes / 60;
                    let stats = await StatsSchema.findOne({
                        employee_id: employeeID,
                        year: currentYear,
                        month: currentMonth
                    });
                    if (stats) {
                        stats.attendance_total_times = stats.attendance_total_times + total_times;
                        stats.attendance_overtime = stats.attendance_total_times - stats.default_schedule_times;
                        await stats.save();
                    } else {
                        console.log("Employee's stats not found");
                    }

                    return res.status(OK).json({
                        success: true,
                        status: OK,
                        message: existingAttendance,
                    });
                } else if (currentTime > endTimePlus30 || currentTime < startTime) {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: `You can not check out at this time ${currentTime.toLocaleTimeString()}`,
                    });
                } else {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: `Err!`,
                    });
                }
            } else if (existingAttendance.shift_info.time_slot.check_in == true && existingAttendance.shift_info.time_slot.check_out == true) {
                return res.status(BAD_REQUEST).json({
                    success: false,
                    status: BAD_REQUEST,
                    message: "You have already check out",
                });
            }
        };
    } catch (err) {
        next(err);
    }
}

// async function uploadImageToS3(file) {
//     const uploadParams = {
//         Bucket: process.env.AWS_S3_BUCKET,
//         Key: `${file.originalname}-${Date.now()}`,
//         Body: file.buffer,
//         ContentType: file.mimetype
//     };

//     try {
//         const command = new PutObjectCommand(uploadParams);
//         await s3Client.send(command);
//         return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadParams.Key}`;
//     } catch (error) {
//         throw error;
//     }
// }

export const updateAttendance = async (req, res, next) => {
    const attendanceID = req.query.attendanceID;
    try {
        const existingAttendance = await AttendanceSchema.findById(attendanceID);
        if (!existingAttendance) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "Attendance not found!",
            });
        } else {
            if (existingAttendance.position === "Autofahrer") {
                if (existingAttendance.shift_info.time_slot.check_in === true && existingAttendance.shift_info.time_slot.check_out !== true) {
                    existingAttendance.car_info.car_type = req.body.car_type;
                    if (existingAttendance.car_info.car_type === "company") {
                        existingAttendance.car_info.car_name === req.body.car_name;
                        const carCompany = await CarSchema.findOne({ car_name: req.body.car_name });
                        // console.log(carCompany);
                        existingAttendance.car_info.car_number = carCompany.car_number;
                        existingAttendance.car_info.register_date = carCompany.register_date;
                    } else {
                        existingAttendance.car_info.car_number === req.body.car_number;
                    }
                    if (!req.body.check_in_km) {
                        return res.status(BAD_REQUEST).json({
                            success: false,
                            status: BAD_REQUEST,
                            message: "check in km is required",
                        });
                    }
                    existingAttendance.check_in_km = req.body.check_in_km;
                    await existingAttendance.save();

                    return res.status(OK).json({
                        success: true,
                        status: OK,
                        message: existingAttendance,
                    });
                } else if (existingAttendance.shift_info.time_slot.check_in === true && existingAttendance.shift_info.time_slot.check_out === true) {
                    if (!req.body.check_out_km) {
                        return res.status(BAD_REQUEST).json({
                            success: false,
                            status: BAD_REQUEST,
                            message: "check out km is required",
                        });
                    }
                    existingAttendance.check_out_km = req.body.check_out_km;
                    existingAttendance.total_km = existingAttendance.check_out_km - existingAttendance.check_in_km;
                    await existingAttendance.save();

                    return res.status(OK).json({
                        success: true,
                        status: OK,
                        message: existingAttendance,
                    });
                }
            } else if (existingAttendance.position === "Service") {
                if (existingAttendance.shift_info.time_slot.check_in === true && existingAttendance.shift_info.time_slot.check_out === true) {
                    // const file = req.file;
                    // if (!file) {
                    //     return res.status(BAD_REQUEST).send('No file uploaded for checkout.');
                    // }

                    // const imageUrl = await uploadImageToS3(file);
                    // existingAttendance.check_out_image = imageUrl;
                    existingAttendance.bar = req.body.bar;
                    existingAttendance.gesamt = req.body.gesamt;
                    existingAttendance.trinked_ec = req.body.trinked_ec;
                    if (!req.body.bar || !req.body.gesamt || !req.body.trinked_ec) {
                        return res.status(BAD_REQUEST).json({
                            success: false,
                            status: BAD_REQUEST,
                            message: "Missing bar or gesamt or trinked_ec",
                        });
                    }
                    if (existingAttendance.department_name === "C2") {
                        if (req.body.trink_geld && !req.body.auf_rechnung) {
                            existingAttendance.trink_geld = req.body.trink_geld;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - req.body.trink_geld + (1.5 / 100) * req.body.gesamt;
                        } else if (req.body.auf_rechnung && !req.body.trink_geld) {
                            existingAttendance.auf_rechnung = req.body.auf_rechnung;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - req.body.auf_rechnung + (1.5 / 100) * req.body.gesamt;
                        } else if (req.body.auf_rechnung && req.body.trink_geld) {
                            existingAttendance.trink_geld = req.body.trink_geld;
                            existingAttendance.auf_rechnung = req.body.auf_rechnung;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - (req.body.auf_rechnung + req.body.trink_geld) + (1.5 / 100) * req.body.gesamt;
                        } else if (!req.body.auf_rechnung && !req.body.trink_geld) {
                            return res.status(BAD_REQUEST).json({
                                success: false,
                                status: BAD_REQUEST,
                                message: "Missing auf_rechnung or trink_geld",
                            });
                        }
                    } else {
                        if (req.body.trink_geld && !req.body.auf_rechnung) {
                            existingAttendance.trink_geld = req.body.trink_geld;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - req.body.trink_geld + (1 / 100) * req.body.gesamt;
                        } else if (req.body.auf_rechnung && !req.body.trink_geld) {
                            existingAttendance.auf_rechnung = req.body.auf_rechnung;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - req.body.auf_rechnung + (1 / 100) * req.body.gesamt;
                        } else if (req.body.auf_rechnung && req.body.trink_geld) {
                            existingAttendance.trink_geld = req.body.trink_geld;
                            existingAttendance.auf_rechnung = req.body.auf_rechnung;
                            existingAttendance.results = req.body.bar - req.body.trinked_ec - (req.body.auf_rechnung + req.body.trink_geld) + (1 / 100) * req.body.gesamt;
                        } else if (!req.body.auf_rechnung && !req.body.trink_geld) {
                            return res.status(BAD_REQUEST).json({
                                success: false,
                                status: BAD_REQUEST,
                                message: "Missing auf_rechnung or trink_geld",
                            });
                        }
                    }
                    await existingAttendance.save();
                    return res.status(OK).json({
                        success: true,
                        status: OK,
                        message: existingAttendance,
                        // imageUrl: imageUrl
                    });
                } else {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: "Not allow!",
                    });
                }
            } else if (existingAttendance.position === "Lito") {
                if (existingAttendance.shift_info.time_slot.check_in === true && existingAttendance.shift_info.time_slot.check_out === true) {
                    existingAttendance.bar = req.body.bar;
                    existingAttendance.kredit_karte = req.body.kredit_karte;
                    existingAttendance.kassen_schniff = req.body.kassen_schniff;
                    existingAttendance.gesamt_ligerbude = req.body.gesamt_ligerbude;
                    existingAttendance.gesamt_liegerando = req.body.gesamt_liegerando;
                    if (!req.body.bar || !req.body.kredit_karte || !req.body.kassen_schniff || !req.body.gesamt_ligerbude || !req.body.gesamt_liegerando) {
                        return res.status(BAD_REQUEST).json({
                            success: false,
                            status: BAD_REQUEST,
                            message: "Missing bar or kredit_karte or kassen_schniff or gesamt_ligerbude or gesamt_liegerando",
                        });
                    }
                    if (existingAttendance.department_name === "C Ulm") {
                        existingAttendance.results = req.body.bar + req.body.kassen_schniff - req.body.kredit_karte - (0.7 / 100) * req.body.gesamt_ligerbude - (0.3 / 100) * req.body.gesamt_liegerando;
                    } else if (existingAttendance.department_name === "C6") {
                        if (req.body.gesamt_ligerbude + req.body.gesamt_liegerando > 1000) {
                            existingAttendance.results = req.body.bar + req.body.kassen_schniff - req.body.kredit_karte - (0.5 / 100) * (req.body.gesamt_ligerbude + req.body.gesamt_liegerando);
                        } else {
                            existingAttendance.results = req.body.bar + req.body.kassen_schniff - req.body.kredit_karte;
                        }
                    } else {
                        existingAttendance.results = req.body.bar + req.body.kassen_schniff - req.body.kredit_karte - (0.5 / 100) * (req.body.gesamt_ligerbude + req.body.gesamt_liegerando);
                    }
                    await existingAttendance.save();
                    return res.status(OK).json({
                        success: true,
                        status: OK,
                        message: existingAttendance,
                    });
                } else {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: "Not allow!",
                    });
                }
            } else {
                return res.status(BAD_REQUEST).json({
                    success: false,
                    status: BAD_REQUEST,
                    message: "Position not allowed!",
                });
            }
        }
    } catch (err) {
        next(err);
    }
}

export const getEmployeeAttendanceCurrentMonth = async (req, res, next) => {
    try {
        const employeeID = req.query.employeeID;
        const departmentName = req.query.department_name;

        if (!employeeID) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Employee ID is required",
            });
        }

        // Use current year and month
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Define date range for the entire current month
        const dateRange = {
            $gte: new Date(year, month, 1),
            $lt: new Date(year, month + 1, 1),
        };

        // Construct the base query
        let query = {
            employee_id: employeeID,
            date: dateRange,
        };

        // Add department name to the query if provided
        if (departmentName) {
            query['department_name'] = departmentName;
        }

        // Execute the query
        const attendances = await AttendanceSchema.find(query).lean();

        // Respond with the attendances
        return res.status(OK).json({
            success: true,
            status: OK,
            message: attendances,
        });
    } catch (err) {
        next(err);
    }
};

export const    getDateDesignCurrentByEmployee = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    const targetDate = req.query.date ? new Date(req.query.date) : null;
    const departmentName = req.query.department_name;

    // Get current year and month if not provided
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    // Use query year and month if provided, otherwise use current year and month
    const targetYear = req.query.year ? parseInt(req.query.year) : currentYear;
    const targetMonth = req.query.month ? parseInt(req.query.month) - 1 : currentMonth;

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
                if (scheduleDate.getFullYear() === targetYear &&
                    scheduleDate.getMonth() === targetMonth &&
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

function calculateDuration(startDate, endDate) {
    const oneDay = 24 * 60 * 60 * 1000;

    const start = new Date(startDate);
    const end = new Date(endDate);

    const durationInMilliseconds = Math.abs(start - end);
    const durationInDays = Math.round(durationInMilliseconds / oneDay + 1);

    return durationInDays;
}

export const createRequest = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const employee = await EmployeeSchema.findOne({ id: employeeID });
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));

        if (employee.realistic_day_off > 0) {
            const newRequest = new RequestSchema({
                employee_id: employee.id,
                employee_name: employee.name,
                default_day_off: employee.default_day_off,
                realistic_day_off: employee.realistic_day_off,
                request_dayOff_start: req.body.request_dayOff_start,
                request_dayOff_end: req.body.request_dayOff_end,
                request_content: req.body.request_content
            })

            const oneMonthBeforeStart = new Date(newRequest.request_dayOff_start);
            oneMonthBeforeStart.setMonth(oneMonthBeforeStart.getMonth() - 1);
            const currentTime = new Date();
            if (
                (oneMonthBeforeStart.getFullYear() === currentTime.getFullYear() &&
                    oneMonthBeforeStart.getMonth() < currentTime.getMonth()) ||
                (oneMonthBeforeStart.getFullYear() === currentTime.getFullYear() &&
                    oneMonthBeforeStart.getMonth() === currentTime.getMonth() &&
                    oneMonthBeforeStart.getDate() < currentTime.getDate()) ||
                (oneMonthBeforeStart.getFullYear() !== currentTime.getFullYear() &&
                    oneMonthBeforeStart.getMonth() === 0 &&
                    oneMonthBeforeStart.getDate() < currentTime.getDate())) {
                return res.status(BAD_REQUEST).json({
                    success: false,
                    status: BAD_REQUEST,
                    message: "Your request is not valid. It should be created within the last month.",
                });
            }

            const dateChecking = await DayOffSchema.findOne({
                date_start: new Date(newRequest.request_dayOff_start),
                date_end: new Date(newRequest.request_dayOff_end),
                type: "specific"
            });
            if (dateChecking) {
                dateChecking.members.push({
                    id: employee.id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role,
                    position: employee.position,
                    status: employee.status
                });
                employee.dayOff_schedule.push({
                    date_start: dateChecking.date_start,
                    date_end: dateChecking.date_end,
                    duration: dateChecking.duration,
                    name: dateChecking.name,
                    type: dateChecking.type,
                    allowed: dateChecking.allowed
                });
                await employee.save();
                await dateChecking.save();
            } else {
                const newDayOff = new DayOffSchema({
                    date_start: new Date(newRequest.request_dayOff_start),
                    date_end: new Date(newRequest.request_dayOff_end),
                    name: "leave",
                    type: "specific",
                });
                const duration = calculateDuration(newDayOff.date_start, newDayOff.date_end);
                if (employee.realistic_day_off < duration) {
                    return res.status(BAD_REQUEST).json({
                        success: false,
                        status: BAD_REQUEST,
                        message: "Your day off total is not enough",
                    });
                }

                newDayOff.members.push({
                    id: employee.id,
                    name: employee.name,
                    email: employee.email,
                    role: employee.role,
                    position: employee.position,
                    status: employee.status
                });
                employee.dayOff_schedule.push({
                    date_start: newDayOff.date_start,
                    date_end: newDayOff.date_end,
                    duration: duration,
                    name: newDayOff.name,
                    type: newDayOff.type,
                    allowed: newDayOff.allowed
                });
                newDayOff.duration = duration;
                await employee.save();
                await newDayOff.save();
            }

            await newRequest.save();
            return res.status(CREATED).json({
                success: true,
                status: CREATED,
                message: newRequest,
            });
        } else {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Your day off total is not enough",
            });
        }
    } catch (err) {
        next(err);
    }
}

export const getAllRequestsForEmployee = async (req, res, next) => {
    const employeeID = req.query.employeeID;
    try {
        const requests = await RequestSchema.find({ employee_id: employeeID });
        return res.status(OK).json({
            success: true,
            status: OK,
            message: requests,
        });
    } catch (err) {
        next(err);
    }
};

export const getAllCarsCompany = async (req, res, next) => {
    try {
        const companyCars = await CarSchema.find();
        return res.status(OK).json({
            success: true,
            status: OK,
            message: companyCars,
        });
    } catch (error) {
        next(error)
    }
}