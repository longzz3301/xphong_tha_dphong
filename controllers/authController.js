import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { createError } from "../utils/error.js";
import { BAD_REQUEST, CONFLICT, CREATED, NOT_FOUND, OK } from "../constant/HttpStatus.js";
import dotenv from 'dotenv';
import AdminSchema from "../models/AdminSchema.js";
import EmployeeSchema from "../models/EmployeeSchema.js";
import DepartmentSchema from "../models/DepartmentSchema.js";
import DayOffSchema from "../models/DayOffSchema.js";

dotenv.config();

export const registerAdmin = async (req, res, next) => {
    try {
        const salt = bcrypt.genSaltSync(10)
        const hash = bcrypt.hashSync(req.body.password, salt)
        const newAdmin = new AdminSchema({
            ...req.body,
            password: hash,
            role: "Admin"
        })
        const admin = await AdminSchema.findOne({ name: newAdmin.name });
        if (admin) return next(createError(CONFLICT, "Admin is already exists!"))

        await newAdmin.save()
        res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newAdmin,
        });
    } catch (err) {
        next(err)
    }
};

export const loginAdmin = async (req, res, next) => {
    try {
        const admin = await AdminSchema.findOne({ name: req.body.name, role: "Admin" });
        if (!admin) return next(createError(NOT_FOUND, "Admin not found!"))
        const isPasswordCorrect = await bcrypt.compare(
            req.body.password,
            admin.password
        )
        if (!isPasswordCorrect) return next(createError(BAD_REQUEST, "Wrong password!"))
        const token_admin = jwt.sign(
            { id: admin.id, role: admin.role == "Admin" },
            process.env.JWT_ADMIN,
            { expiresIn: "24h" },
        )
        const { password, ...otherDetails } = admin._doc;
        res.cookie("access_token_admin", token_admin, {
            httpOnly: true,
            sameSite: "none",
            secure: true,
        }).status(OK).json({ details: { ...otherDetails } })
    } catch (err) {
        next(err)
    }
};

export const logoutAdmin = (req, res, next) => {
    res.clearCookie("access_token_admin")
        .status(OK)
        .json("Admin has been successfully logged out.");
};

export const registerInhaberByAdmin = async (req, res, next) => {
    let departmentNames = req.body.department_name;
    try {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newInhaber = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Inhaber",
            active_day: new Date()
        });

        const isIdExists = await EmployeeSchema.findOne({ id: newInhaber.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newInhaber.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Inhaber already exists.",
            });
        }

        // Convert departmentNames to an array if it's a string
        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        for (const deptName of departmentNames) {
            const department = await DepartmentSchema.findOne({ name: deptName });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.name === newInhaber.name)) {
                return next(createError(CONFLICT, `Inhaber already exists in department ${deptName}!`));
            }

            department.members.push({
                id: newInhaber.id,
                name: newInhaber.name,
                email: newInhaber.email,
                role: newInhaber.role,
                position: req.body.position,
                status: newInhaber.status
            });
            await department.save();

            newInhaber.department.push({
                name: deptName,
                position: req.body.position
            });
        }

        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newInhaber.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newInhaber.id,
                name: newInhaber.name,
                email: newInhaber.email,
                role: newInhaber.role,
                status: newInhaber.status
            });
            globalDayOff.save();
        });

        newInhaber.realistic_day_off = newInhaber.default_day_off;
        await newInhaber.save();

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newInhaber,
        });
    } catch (err) {
        next(err);
    }
};

export const loginInhaber = async (req, res, next) => {
    try {
        const inhaber = await EmployeeSchema.findOne({ name: req.body.name, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"))
        const isPasswordCorrect = await bcrypt.compare(
            req.body.password,
            inhaber.password
        )
        if (!isPasswordCorrect) return next(createError(BAD_REQUEST, "Wrong password!"))
        const token_inhaber = jwt.sign(
            { id: inhaber.id, role: inhaber.role == "Inhaber" },
            process.env.JWT_INHABER,
            { expiresIn: "24h" },
        )
        const { password, ...otherDetails } = inhaber._doc;
        res.cookie("access_token_inhaber", token_inhaber, {
            httpOnly: true,
            sameSite: "none",
            secure: true,
        }).status(OK).json({ details: { ...otherDetails } })
    } catch (err) {
        next(err)
    }
};

export const logoutInhaber = (req, res, next) => {
    res.clearCookie("access_token_inhaber")
        .status(OK)
        .json("Inhaber has been successfully logged out.");
};

export const registerManagerByAdmin = async (req, res, next) => {
    let departmentNames = req.body.department_name;
    try {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newManager = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Manager",
            active_day: new Date()
        });

        const isIdExists = await EmployeeSchema.findOne({ id: newManager.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newManager.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Manager already exists.",
            });
        }

        // Convert departmentNames to an array if it's a string
        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        for (const deptName of departmentNames) {
            const department = await DepartmentSchema.findOne({ name: deptName });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.name === newManager.name)) {
                return next(createError(CONFLICT, `Manager already exists in department ${deptName}!`));
            }

            department.members.push({
                id: newManager.id,
                name: newManager.name,
                email: newManager.email,
                role: newManager.role,
                position: req.body.position,
                status: newManager.status
            });
            await department.save();

            newManager.department.push({
                name: deptName,
                position: req.body.position
            });
        }

        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newManager.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newManager.id,
                name: newManager.name,
                email: newManager.email,
                role: newManager.role,
                status: newManager.status
            });
            globalDayOff.save();
        });

        newManager.realistic_day_off = newManager.default_day_off;
        await newManager.save();

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newManager,
        });
    } catch (err) {
        next(err);
    }
};

export const registerManagerByInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    let departmentNames = req.body.department_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        // Convert departmentNames to an array if it's a string
        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        // Filter out departments not in the Inhaber's departments
        const validDepartments = departmentNames.filter(deptName =>
            inhaber.department.some(dept => dept.name === deptName)
        );

        if (validDepartments.length === 0) {
            return next(createError(NOT_FOUND, "No valid departments found in Inhaber's departments!"));
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newManager = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Manager",
            active_day: new Date()
        });
        newManager.realistic_day_off = newManager.default_day_off;

        const isIdExists = await EmployeeSchema.findOne({ id: newManager.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newManager.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Manager already exists.",
            });
        }

        for (const deptName of validDepartments) {
            const department = await DepartmentSchema.findOne({ name: deptName });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.name === newManager.name)) {
                return next(createError(CONFLICT, `Manager already exists in department ${deptName}!`));
            }
            department.members.push({
                id: newManager.id,
                name: newManager.name,
                email: newManager.email,
                role: newManager.role,
                position: req.body.position,
                status: newManager.status
            });
            await department.save();

            newManager.department.push({
                name: deptName,
                position: req.body.position
            });
        }
        await newManager.save();

        // Handle global day offs
        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newManager.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newManager.id,
                name: newManager.name,
                email: newManager.email,
                role: newManager.role,
                status: newManager.status
            });
            globalDayOff.save();
        });

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newManager,
        });
    } catch (err) {
        next(err);
    }
};

export const loginManager = async (req, res, next) => {
    try {
        const manager = await EmployeeSchema.findOne({ name: req.body.name, role: "Manager" });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"))
        const isPasswordCorrect = await bcrypt.compare(
            req.body.password,
            manager.password
        )
        if (!isPasswordCorrect) return next(createError(BAD_REQUEST, "Wrong password!"))
        const token_manager = jwt.sign(
            { id: manager.id, role: manager.role == "Manager" },
            process.env.JWT_MANAGER,
            { expiresIn: "24h" },
        )
        const { password, ...otherDetails } = manager._doc;
        res.cookie("access_token_manager", token_manager, {
            httpOnly: true,
            sameSite: "none",
            secure: true,
        }).status(OK).json({ details: { ...otherDetails } })
    } catch (err) {
        next(err)
    }
};

export const logoutManager = (req, res, next) => {
    res.clearCookie("access_token_manager")
        .status(OK)
        .json("Manager has been successfully logged out.");
};

export const registerEmployeeByAdmin = async (req, res, next) => {
    let departmentNames = req.body.department_name;
    try {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newEmployee = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Employee",
            active_day: new Date()
        });

        const isIdExists = await EmployeeSchema.findOne({ id: newEmployee.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newEmployee.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Employee already exists.",
            });
        }

        // Convert departmentNames to an array if it's a string
        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        for (const deptName of departmentNames) {
            const department = await DepartmentSchema.findOne({ name: deptName.trim() });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.id === newEmployee.id)) {
                return next(createError(CONFLICT, `Employee already exists in department ${deptName}!`));
            }

            department.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                position: req.body.position,
                status: newEmployee.status
            });
            await department.save();

            newEmployee.department.push({
                name: deptName,
                position: req.body.position
            });
        }

        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newEmployee.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                status: newEmployee.status
            });
            globalDayOff.save();
        });

        newEmployee.realistic_day_off = newEmployee.default_day_off;
        await newEmployee.save();

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newEmployee,
        });
    } catch (err) {
        next(err);
    }
};

export const registerEmployeeByInhaber = async (req, res, next) => {
    const inhaberName = req.query.inhaber_name;
    let departmentNames = req.body.department_name;
    try {
        const inhaber = await EmployeeSchema.findOne({ name: inhaberName, role: "Inhaber" });
        if (!inhaber) return next(createError(NOT_FOUND, "Inhaber not found!"));

        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        const validDepartments = departmentNames.filter(deptName =>
            inhaber.department.some(dept => dept.name === deptName)
        );

        if (validDepartments.length === 0) {
            return next(createError(NOT_FOUND, "No valid departments found in Inhaber's departments!"));
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newEmployee = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Employee",
            active_day: new Date()
        });
        newEmployee.realistic_day_off = newEmployee.default_day_off;

        const isIdExists = await EmployeeSchema.findOne({ id: newEmployee.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newEmployee.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Employee already exists.",
            });
        }

        for (const deptName of validDepartments) {
            const department = await DepartmentSchema.findOne({ name: deptName });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.name === newEmployee.name)) {
                return next(createError(CONFLICT, `Employee already exists in department ${deptName}!`));
            }
            department.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                position: req.body.position,
                status: newEmployee.status
            });
            await department.save();

            newEmployee.department.push({
                name: deptName,
                position: req.body.position
            });
        }
        await newEmployee.save();

        // Handle global day offs
        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newEmployee.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                status: newEmployee.status
            });
            globalDayOff.save();
        });

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newEmployee,
        });
    } catch (err) {
        next(err);
    }
};

export const registerEmployeeByManager = async (req, res, next) => {
    const managerName = req.query.manager_name;
    let departmentNames = req.body.department_name;
    try {
        const manager = await EmployeeSchema.findOne({ name: managerName, role: "Manager" });
        if (!manager) return next(createError(NOT_FOUND, "Manager not found!"));

        if (typeof departmentNames === 'string') {
            departmentNames = departmentNames.split(',');
        }

        const validDepartments = departmentNames.filter(deptName =>
            manager.department.some(dept => dept.name === deptName)
        );

        if (validDepartments.length === 0) {
            return next(createError(NOT_FOUND, "No valid departments found in Manager's departments!"));
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(req.body.password, salt);

        const newEmployee = new EmployeeSchema({
            ...req.body,
            password: hash,
            role: "Employee",
            active_day: new Date()
        });
        newEmployee.realistic_day_off = newEmployee.default_day_off;

        const isIdExists = await EmployeeSchema.findOne({ id: newEmployee.id });
        const isNameExists = await EmployeeSchema.findOne({ name: newEmployee.name });

        if (isIdExists || isNameExists) {
            return res.status(BAD_REQUEST).json({
                success: false,
                status: BAD_REQUEST,
                message: "Employee already exists.",
            });
        }

        for (const deptName of validDepartments) {
            const department = await DepartmentSchema.findOne({ name: deptName });
            if (!department) {
                return next(createError(NOT_FOUND, `Department ${deptName} not found!`));
            }

            if (department.members.some(member => member.name === newEmployee.name)) {
                return next(createError(CONFLICT, `Employee already exists in department ${deptName}!`));
            }
            department.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                position: req.body.position,
                status: newEmployee.status
            });
            await department.save();

            newEmployee.department.push({
                name: deptName,
                position: req.body.position
            });
        }
        await newEmployee.save();

        // Handle global day offs
        const globalDayOffs = await DayOffSchema.find({ type: 'global' });
        globalDayOffs.forEach(globalDayOff => {
            newEmployee.dayOff_schedule.push({
                date_start: globalDayOff.date_start,
                date_end: globalDayOff.date_end,
                duration: globalDayOff.duration,
                name: globalDayOff.name,
                type: globalDayOff.type,
                allowed: globalDayOff.allowed
            });

            globalDayOff.members.push({
                id: newEmployee.id,
                name: newEmployee.name,
                email: newEmployee.email,
                role: newEmployee.role,
                status: newEmployee.status
            });
            globalDayOff.save();
        });

        return res.status(CREATED).json({
            success: true,
            status: CREATED,
            message: newEmployee,
        });
    } catch (err) {
        next(err);
    }
};

export const loginEmployee = async (req, res, next) => {
    try {
        const employee = await EmployeeSchema.findOne({ name: req.body.name })
        if (!employee) return next(createError(NOT_FOUND, "Employee not found!"))
        const isPasswordCorrect = await bcrypt.compare(
            req.body.password,
            employee.password
        )
        if (!isPasswordCorrect) return next(createError(BAD_REQUEST, "Wrong password!"))
        const token_employee = jwt.sign(
            { id: employee.id },
            process.env.JWT_EMPLOYEE,
            { expiresIn: "24h" },
        )
        // console.log(token_employee);
        const { password, ...otherDetails } = employee._doc;
        res.cookie("access_token_employee", token_employee, {
            httpOnly: true,
            sameSite: "none",
            secure: false,
        }).status(OK).json({ details: { ...otherDetails } })
    } catch (err) {
        next(err)
    }
};

export const logoutEmployee = (req, res, next) => {
    res.clearCookie("access_token_employee")
        .status(OK).
        json("Employee has been successfully logged out.");
};