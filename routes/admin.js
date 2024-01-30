import express from 'express';
import {
    deleteEmployeeById, getAllEmployeesSchedules, getAllRequests, getAttendance,
    getEmployeeById, getForm, getLogs, getRequestById, getStats, handleRequest,
     searchSpecific, updateAttendance, updateEmployee
} from '../controllers/adminController.js';
import {
    addMemberDepartment, createCar, createDepartment, deleteCar, deleteDepartmentByName, getAllDepartments,
    getCar, getDepartmentByName, getDepartmentSpecific, removeMemberDepartment, updateCar, updateDepartment
} from '../controllers/departmentController.js';
import {
    createShift, getAllShifts,
    getShiftByCode, getShiftByName, updateShift
} from '../controllers/shiftController.js';
import { verifyTokenAdmin } from '../utils/verifyToken.js';
import { getSalary, salaryCalculate } from '../controllers/salaryController.js';
import {
    exportAttendanceToExcel, exportEmployeeDataToExcel, exportEmployeeSalaryDataToExcel
} from '../controllers/xlsxController.js';
import {
    xcreateMultipleDateDesigns, deleteDateSpecific, getDateDesign
} from '../controllers/dateDesignController.js';
import {
    createDayOff, deleteDayOffById, deleteEmployeeDayOff,
    getAllGlobalDayOffs, getDayOffById, getEmployeeDayOffs
} from '../controllers/dayOffController.js';

const router = express.Router();

// all
router.get('/manage-all/search-specific', verifyTokenAdmin, searchSpecific); //search infor employee by name , role , depa , id , position 

// employee
router.get('/manage-employee/get-all-schedules', verifyTokenAdmin, getAllEmployeesSchedules); // get các nhân viên querry theo thời gian lịch làm 
router.get('/manage-employee/get-byId', verifyTokenAdmin, getEmployeeById); //  get employee
router.delete('/manage-employee/delete-byId', verifyTokenAdmin, deleteEmployeeById); // delete employee 
router.put('/manage-employee/update-basic', verifyTokenAdmin, updateEmployee); //  update 
// router.put('/manage-employee/make-inactive', verifyTokenAdmin, madeEmployeeInactive);

// department
router.post('/manage-department/create', verifyTokenAdmin, createDepartment); // tạo 
router.get('/manage-department/get-all', verifyTokenAdmin, getAllDepartments);//(1) get casc department cho muc select dashboard 
router.get('/manage-department/get-by-name', verifyTokenAdmin, getDepartmentByName);
router.get('/manage-department/get-specific', verifyTokenAdmin, getDepartmentSpecific);
router.put('/manage-department/update', verifyTokenAdmin, updateDepartment);
router.put('/manage-department/add-member/:name', verifyTokenAdmin, addMemberDepartment);
router.put('/manage-department/remove-member/:name', verifyTokenAdmin, removeMemberDepartment);
router.delete('/manage-department/delete', verifyTokenAdmin, deleteDepartmentByName);

// shift
router.post('/manage-shift/create', verifyTokenAdmin, createShift); // tạo ca làm 
router.get('/manage-shift/get-all', verifyTokenAdmin, getAllShifts); // lấy các ca làm được tạo để add vào ngày làm việc trong lịch 
router.get('/manage-shift/get-by-code', verifyTokenAdmin, getShiftByCode); //
router.get('/manage-shift/get-by-name', verifyTokenAdmin, getShiftByName);
router.put('/manage-shift/update', verifyTokenAdmin, updateShift);

// date design
router.post('/manage-date-design/create-days', verifyTokenAdmin, xcreateMultipleDateDesigns);
router.get('/manage-date-design/get-by-specific', verifyTokenAdmin, getDateDesign); // gọi api này để gán thời gian querry từ ca làm vào ngày làm của nhân viên 
router.delete('/manage-date-design/delete', verifyTokenAdmin, deleteDateSpecific);

// day off
router.post('/manage-day-off/create', verifyTokenAdmin, createDayOff);
router.get('/manage-day-off/get-all', verifyTokenAdmin, getAllGlobalDayOffs);
router.get('/manage-day-off/get-byId/:_id', verifyTokenAdmin, getDayOffById);
router.delete('/manage-day-off/delete-byId/:_id', verifyTokenAdmin, deleteDayOffById);
router.get('/manage-day-off/get-specific-employee', verifyTokenAdmin, getEmployeeDayOffs);
router.delete('/manage-day-off/delete-employee/:_id', verifyTokenAdmin, deleteEmployeeDayOff);

// manage request ???
router.get('/manage-request/get-all', verifyTokenAdmin, getAllRequests); // ? 
router.get('/manage-request/get-byId/:_id', verifyTokenAdmin, getRequestById);
router.put('/manage-request/handle/:_id', verifyTokenAdmin, handleRequest);

// manage attendance
router.get('/manage-attendance/get-by-specific', getAttendance); // (1) trang dash board get những attendance đã được điểm danh của employee theo Date 
router.put('/manage-attendance/update/:_id', verifyTokenAdmin, updateAttendance);

// manage salary 
router.post('/manage-salary/calculate/:employeeID', verifyTokenAdmin, salaryCalculate); // tính tiền lương 
router.get('/manage-salary/get', verifyTokenAdmin, getSalary); // lấy bảng chấm công theo giờ 

// manage xlsx
router.get('/manage-xlsx/employee-data', verifyTokenAdmin, exportEmployeeDataToExcel); // export file dữ liệu 
router.get('/manage-xlsx/salary-data', verifyTokenAdmin, exportEmployeeSalaryDataToExcel);
router.get('/manage-xlsx/attendance-data', verifyTokenAdmin, exportAttendanceToExcel);

// // manage cars
// router.post('/manage-car/create', verifyTokenAdmin, createCar);
// router.get('/manage-car/get', verifyTokenAdmin, getCar);
// router.put('/manage-car/update', verifyTokenAdmin, updateCar);
// router.delete('/manage-car/delete', verifyTokenAdmin, deleteCar);

// manage stats
router.get('/manage-stats/get', verifyTokenAdmin, getStats);

// manage logs
router.get('/manage-logs/get', verifyTokenAdmin, getLogs);

// manage form
router.get('/manage-form/get', verifyTokenAdmin, getForm);

export default router;