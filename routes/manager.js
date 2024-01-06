import express from 'express';
import { verifyTokenManager } from '../utils/verifyToken.js';
import {
    addMemberToDepartmentByManager, createMultipleDateDesignsByManager, deleteDateSpecificByManager,
    getAttendanceForManager, getDateDesignForManager, getEmployeeByIdForManager, searchSpecificForManager,
    getEmployeesSchedulesByManager, getStatsForManager, removeMemberFromDepartmentByManager
} from '../controllers/managerController.js';
import { createShift, getAllShifts, getShiftByCode, getShiftByName, updateShift } from '../controllers/shiftController.js';

const router = express.Router();

// manage employee
router.get("/manage-employee/search-specific", verifyTokenManager, searchSpecificForManager);
router.get("/manage-employee/get-all-schedules", verifyTokenManager, getEmployeesSchedulesByManager);
router.get("/manage-employee/get-byId", verifyTokenManager, getEmployeeByIdForManager);

// manage date design
router.post("/manage-date-design/create-days", verifyTokenManager, createMultipleDateDesignsByManager);
router.get('/manage-date-design/get-by-specific', verifyTokenManager, getDateDesignForManager);
router.delete('/manage-date-design/delete', verifyTokenManager, deleteDateSpecificByManager);

// manage shift
router.post('/manage-shift/create', verifyTokenManager, createShift);
router.get('/manage-shift/get-all', verifyTokenManager, getAllShifts);
router.get('/manage-shift/get-by-code', verifyTokenManager, getShiftByCode);
router.get('/manage-shift/get-by-name', verifyTokenManager, getShiftByName);
router.put('/manage-shift/update', verifyTokenManager, updateShift);

// manage attendance
router.get('/manage-attendance/get-by-specific', verifyTokenManager, getAttendanceForManager);

// manage department
router.put('/manage-department/add-member/:name', verifyTokenManager, addMemberToDepartmentByManager);
router.put('/manage-department/remove-member/:name', verifyTokenManager, removeMemberFromDepartmentByManager);

// manage stats
router.get('/manage-stats/get', verifyTokenManager, getStatsForManager);

export default router;