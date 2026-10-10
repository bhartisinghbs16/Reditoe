import express from 'express';
import { protect } from '../../middleware/auth.js';
import {
  getMembership,
  getPlans,
  subscribe,
  updateMembership,
} from '../../controllers/user/membershipController.js';
import {
  getTransactions,
  getWallet,
  sendToBank,
} from '../../controllers/user/walletController.js';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from '../../controllers/user/savedAddressController.js';

/**
 * The endpoints the customer app needed and the API did not have: Reditoe Plus,
 * the customer wallet, and CRUD for saved delivery addresses.
 *
 * Mounted in routes/index.js as /api/membership, /api/wallet and
 * /api/addresses.
 */

const membershipRouter = express.Router();
// Plans are public so the app can show Plus before the customer signs in.
membershipRouter.get('/plans', getPlans);
membershipRouter.get('/', protect, getMembership);
membershipRouter.post('/subscribe', protect, subscribe);
membershipRouter.patch('/', protect, updateMembership);

const walletRouter = express.Router();
walletRouter.use(protect);
walletRouter.get('/', getWallet);
walletRouter.get('/transactions', getTransactions);
/*
 * `/add-money` is gone on purpose.
 *
 * It raised the balance by whatever number it was sent, with nothing paid and
 * nobody charged — any signed-in customer could have given themselves an
 * unlimited wallet. Money now enters through `/orders/razorpay/wallet-topup`,
 * which credits only on the gateway's signed confirmation. The handler is
 * left in the controller for the admin-side credit that support uses.
 */
walletRouter.post('/send-to-bank', sendToBank);

const addressRouter = express.Router();
addressRouter.use(protect);
addressRouter.get('/', listAddresses);
addressRouter.post('/', createAddress);
addressRouter.put('/:id', updateAddress);
addressRouter.patch('/:id/default', setDefaultAddress);
addressRouter.delete('/:id', deleteAddress);

export { membershipRouter, walletRouter, addressRouter };
