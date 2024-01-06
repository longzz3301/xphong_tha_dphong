import express from 'express';
import { generateDepartmentQRCode, getDepartmentQRCode } from '../controllers/qrController.js';

const router = express.Router();

// Define your routes
router.get('/generate', generateDepartmentQRCode);
router.get('/get', getDepartmentQRCode);

export default router;
