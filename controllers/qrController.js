import qr from 'qrcode';
import { OK, SYSTEM_ERROR, NOT_FOUND } from '../constant/HttpStatus.js';
import DepartmentSchema from '../models/DepartmentSchema.js';

const generateAndSendQRCode = async (res, departmentName) => {
    try {
        const department = await DepartmentSchema.findOne({ name: departmentName });
        if (!department) {
            res.status(NOT_FOUND).json({ error: 'Department not found' });
            return;
        }

        const timestamp = new Date().toISOString();
        const qrData = `QR code for Department ${department.name} - ${timestamp}`;

        department.qr_code = qrData;
        await department.save();

        qr.toFile(`Department ${department.name}`, qrData, (err) => {
            if (err) {
                console.error(err);
                res.status(SYSTEM_ERROR).json({ error: 'Failed to generate QR code' });
            } else {
                console.log('QR code generated');
            }
        });
    } catch (error) {
        console.error(error);
        res.status(SYSTEM_ERROR).json({ error: 'Something went wrong' });
    }
};

export const generateDepartmentQRCode = (req, res) => {
    const departmentName = req.query.department_name;

    generateAndSendQRCode(res, departmentName);

    const intervalId = setInterval(() => {
        generateAndSendQRCode(res, departmentName);
    }, 20000);

    res.on('close', () => {
        clearInterval(intervalId);
    });
};

export const getDepartmentQRCode = async (req, res, next) => {
    const departmentName = req.query.department_name;
    const department = await DepartmentSchema.findOne({ name: departmentName });
    if (!department) {
        return res.status(NOT_FOUND).json({ error: 'Department not found' });
    }
    res.status(OK).json({
        success: true,
        status: OK,
        message: department.qr_code,
    });
}
