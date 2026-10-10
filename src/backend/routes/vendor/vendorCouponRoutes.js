import express from 'express';
import {
  getVendorCoupons,
  createVendorCoupon,
  toggleVendorCoupon,
  deleteVendorCoupon,
} from '../../controllers/vendor/vendorCouponController.js';

const router = express.Router();

router.get('/', getVendorCoupons);
router.post('/', createVendorCoupon);
router.patch('/:id/toggle', toggleVendorCoupon);
router.delete('/:id', deleteVendorCoupon);

export default router;