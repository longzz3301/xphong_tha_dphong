import express from 'express';
import {
    loginAdmin, loginEmployee, loginInhaber, loginManager,
    logoutAdmin, logoutEmployee, logoutInhaber, logoutManager, registerAdmin,
    registerEmployeeByAdmin, registerEmployeeByInhaber, registerEmployeeByManager,
    registerInhaberByAdmin, registerManagerByAdmin, registerManagerByInhaber
} from '../controllers/authController.js';
import {
    verifyTokenAdmin, verifyTokenEmployee, verifyTokenInhaber, verifyTokenManager,
} from '../utils/verifyToken.js';

const router = express.Router();

// authen admin
router.post('/manage-admin/register-admin', verifyTokenAdmin, registerAdmin);
router.post('/manage-admin/login-admin', loginAdmin);
router.post('/manage-admin/logout-admin', verifyTokenAdmin, logoutAdmin);

// authen inhaber
router.post('/manage-admin/register-inhaber', verifyTokenAdmin, registerInhaberByAdmin);
router.post('/manage-inhaber/login-inhaber', loginInhaber);
router.post('/manage-inhaber/logout-inhaber', verifyTokenInhaber, logoutInhaber);

// authen manager
router.post('/manage-admin/register-manager', verifyTokenAdmin, registerManagerByAdmin);
router.post('/manage-inhaber/register-manager', verifyTokenInhaber, registerManagerByInhaber);
router.post('/manage-manager/login-manager', loginManager);
router.post('/manage-manager/logout-manager', verifyTokenManager, logoutManager);

// authen employee
router.post('/manage-admin/register-employee', verifyTokenAdmin, registerEmployeeByAdmin); // tạo eomployee 
router.post('/manage-inhaber/register-employee', verifyTokenInhaber, registerEmployeeByInhaber);
router.post('/manage-manager/register-employee', verifyTokenManager, registerEmployeeByManager);
router.post('/manage-employee/login-employee', loginEmployee);
router.post('/manage-employee/logout-employee', verifyTokenEmployee, logoutEmployee);

export default router;