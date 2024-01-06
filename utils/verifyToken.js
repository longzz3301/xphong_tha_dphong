import jwt from "jsonwebtoken";
import { FORBIDDEN, UNAUTHORIZED } from "../constant/HttpStatus.js";
import { createError } from "../utils/error.js";
import dotenv from 'dotenv';

dotenv.config();

export const verifyTokenAdmin = (req, res, next) => {
    const token_admin = req.cookies.access_token_admin;
    if (!token_admin) return next(createError(UNAUTHORIZED, "You are not authenticated as admin"));

    jwt.verify(token_admin, process.env.JWT_ADMIN, (err, admin) => {
        if (err) {
            return next(createError(FORBIDDEN, "Token is not valid"));
        } else {
            // console.log(req);
            req.admin = admin;
            next();
        }
    });
};

export const verifyTokenInhaber = (req, res, next) => {
    const token_inhaber = req.cookies.access_token_inhaber;
    if (!token_inhaber) return next(createError(UNAUTHORIZED, "You are not authenticated as inhaber"));

    jwt.verify(token_inhaber, process.env.JWT_INHABER, (err, inhaber) => {
        if (err) {
            return next(createError(FORBIDDEN, "Token is not valid"));
        } else {
            // console.log(req);
            req.inhaber = inhaber;
            next();
        }
    });
};

export const verifyTokenManager = (req, res, next) => {
    const token_manager = req.cookies.access_token_manager;
    if (!token_manager) return next(createError(UNAUTHORIZED, "You are not authenticated as manager"));

    jwt.verify(token_manager, process.env.JWT_MANAGER, (err, manager) => {
        if (err) {
            return next(createError(FORBIDDEN, "Token is not valid"));
        } else {
            // console.log(req);
            req.manager = manager;
            next();
        }
    });
};

export const verifyTokenEmployee = (req, res, next) => {
    const token_employee = req.cookies.access_token_employee;
    if (!token_employee) return next(createError(UNAUTHORIZED, "You are not authenticated as employee"));

    jwt.verify(token_employee, process.env.JWT_EMPLOYEE, (err, employee) => {
        if (err) {
            return next(createError(FORBIDDEN, "Token is not valid"));
        } else {
            req.employee = employee;
            next();
        }
    });
};