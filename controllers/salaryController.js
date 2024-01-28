import { BAD_REQUEST, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import AttendanceSchema from "../models/AttendanceSchema.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import SalarySchema from "../models/SalarySchema.js";
import StatsSchema from "../models/StatsSchema.js";
import { createError } from "../utils/error.js";

export const salaryCalculate = async (req, res, next) => {
    const employeeID = req.params.employeeID;
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    if (!year || !month || !employeeID) {
        return res.status(BAD_REQUEST).json({
            success: false,
            status: BAD_REQUEST,
            message: "Year, month, and employee ID are required parameters",
        });
    }

    const employee = await EmployeeSchema.findOne({ id: employeeID });
    if (!employee) return next(createError(NOT_FOUND, "Employee not found!"));
    if (employee.status === "inactive") return next(createError(NOT_FOUND, "Employee not active!"));

    let stats = await StatsSchema.findOne({
        employee_id: employeeID,
        year: year,
        month: month
    });

    let existSalary = await SalarySchema.findOne({
        employee_id: employeeID,
        year: year,
        month: month
    });

    // Initialize parameters for calculation
    let a = req.body.a_new;
    let b = req.body.b_new;
    // let c = req.body.c_new;
    // let d = req.body.d_new ?? 0.25;
    // let f = req.body.f_new;

    if (!a) {
        if (existSalary) {
            a = existSalary.a_parameter;
        } else {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "You need to provided a parameter",
            });
        }
    }

    if (!b) {
        if (existSalary) {
            b = existSalary.b_parameter;
        } else {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "You need to provided b parameter",
            });
        }
    }


    // Define the date range for the whole month
    const dateRange = {
        $gte: new Date(year, month - 1, 1, 0, 0, 0, 0),
        $lt: new Date(year, month, 0, 23, 59, 59, 999),
    };

    // Find employee attendance for the specified date range
    const employeeAttendance = await AttendanceSchema.find({
        employee_id: employeeID,
        date: dateRange,
    });

    // Initialize the salary record
    let salaryRecord = {
        employee_id: employee.id,
        employee_name: employee.name,
        year: year,
        month: month,
        date_calculate: new Date(),
        total_salary: 0,
        total_times: stats.attendance_total_times + stats.attendance_overtime,
        day_off: employee.default_day_off - employee.realistic_day_off,
        hour_normal: [],
        total_hour_work: stats.attendance_total_times,
        total_hour_overtime: stats.attendance_overtime,
        total_km: 0,
        a_parameter: a,
        b_parameter: b,
        // c_parameter: c,
        // d_parameter: d,
        // f_parameter: f
    };

    employeeAttendance.forEach(attendance => {
        const { department_name, shift_info, total_km } = attendance;
        const { total_hour, total_minutes } = shift_info;

        // Check if the employee has the position in the department for Autofahrer
        const isAutofahrer = employee.department.some(dep =>
            dep.name === department_name && dep.position.includes("Autofahrer")
        );

        if (isAutofahrer) {
            salaryRecord.total_km += total_km;
        }

        let departmentRecord = salaryRecord.hour_normal.find(dep => dep.department_name === department_name);
        if (!departmentRecord) {
            departmentRecord = {
                department_name: department_name,
                total_hour: 0,
                total_minutes: 0
            };
            salaryRecord.hour_normal.push(departmentRecord);
        }
        departmentRecord.total_hour += total_hour;
        departmentRecord.total_minutes += total_minutes;
    });

    // Calculate day-off salary
    const days_off = employee.default_day_off - employee.realistic_day_off;
    const salary_day_off = [(b * 3) / 65] * days_off; 

    // if (salaryRecord.total_times > employee.total_time_per_month) {
    //     salaryRecord.total_salary = (a / employee.total_time_per_month) * employee.total_time_per_month + (salaryRecord.total_times - employee.total_time_per_month) * f - b - c + salary_day_off - employee.house_rent_money + salaryRecord.total_km * d;
    // }
    salaryRecord.total_salary = a * salaryRecord.total_times + salary_day_off 

    await employee.save();
    // Save or update the salary record
    if (existSalary) {
        const updateSalary = await SalarySchema.findOneAndUpdate(
            { _id: existSalary._id },
            { $set: salaryRecord },
            { new: true }
        )
        return res.status(OK).json({
            success: true,
            status: OK,
            message: updateSalary
        });
    } else {
        // console.log(salaryRecord);
        const newSalary = new SalarySchema(salaryRecord);
        await newSalary.save();
        return res.status(OK).json({
            success: true,
            status: OK,
            message: newSalary
        });
    }
};

export const getSalary = async (req, res, next) => {
    try {
        const { year, month, employeeID, department_name } = req.query;

        let query = {};

        // Include time query only if provided
        if (year) query.year = parseInt(year);
        if (month) query.month = parseInt(month);

        let employeeIds = [];
        if (department_name) {
            const employeesInDepartment = await EmployeeSchema.find({ 'department.name': department_name }).select('id');
            employeeIds = employeesInDepartment.map(employee => employee.id);
            query.employee_id = { $in: employeeIds };
        }

        // Override employee_id in query if employeeID is provided
        if (employeeID) {
            if (department_name) {
                // Check if employeeID is within the department
                query.employee_id = employeeIds.includes(employeeID) ? employeeID : null;
            } else {
                // If department is not specified, search by employeeID directly
                query.employee_id = employeeID;
            }
        }

        if (query.employee_id === null) {
            return res.status(NOT_FOUND).json({
                success: false,
                status: NOT_FOUND,
                message: "Employee not found in the provided department."
            });
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

