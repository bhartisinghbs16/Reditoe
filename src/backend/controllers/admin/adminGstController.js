import StateGst from '../../models/StateGst.js';

/**
 * The platform's GST registrations, one per state.
 *
 * Read by the invoice for an order, which needs the registration belonging to
 * the state the order was delivered in - so these are business records rather
 * than settings, and the history of when each applied matters.
 */

/** GET /api/admin/gst */
export const listStateGst = async (req, res) => {
  try {
    const rows = await StateGst.find().sort({ stateName: 1 }).lean();

    return res.status(200).json({
      status: 'success',
      data: {
        gst: rows,
        summary: {
          total: rows.length,
          active: rows.filter((r) => r.isActive).length,
          inactive: rows.filter((r) => !r.isActive).length,
          lastUpdated: rows.reduce(
            (latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest),
            null
          ),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /api/admin/gst
 *
 * Creating and updating are the same operation: a state has one registration,
 * so saving Andhra Pradesh twice replaces it rather than making a second.
 */
export const saveStateGst = async (req, res) => {
  try {
    const { stateName, stateCode, gstin } = req.body;

    if (!stateName || !stateCode || !gstin) {
      return res.status(400).json({
        status: 'error',
        message: 'State, state code and GSTIN are all required.',
      });
    }

    /**
     * The first two digits of a GSTIN are the state's own code, so a mismatch
     * means one of the two fields is wrong. Catching it here saves an invoice
     * carrying a number that belongs to another state.
     */
    if (String(gstin).slice(0, 2) !== String(stateCode)) {
      return res.status(400).json({
        status: 'error',
        message: `A GSTIN for this state must begin with ${stateCode}.`,
      });
    }

    const row = await StateGst.findOneAndUpdate(
      { stateName: stateName.trim() },
      {
        $set: {
          stateName: stateName.trim(),
          stateCode: String(stateCode).trim(),
          gstin: String(gstin).trim().toUpperCase(),
          isActive: req.body.isActive !== false,
          effectiveFrom: req.body.effectiveFrom || undefined,
          effectiveTo: req.body.effectiveTo || undefined,
          gstType: req.body.gstType || 'Regular',
          address: req.body.address || undefined,
          certificateUrl: req.body.certificateUrl || undefined,
          updatedBy: req.user?._id,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      status: 'success',
      message: `GST details saved for ${row.stateName}`,
      data: { gst: row },
    });
  } catch (error) {
    // A failed pattern match is the operator's mistake, not the server's.
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        message: Object.values(error.errors)[0]?.message || 'Those details are not valid.',
      });
    }
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/** DELETE /api/admin/gst/:id */
export const deleteStateGst = async (req, res) => {
  try {
    const row = await StateGst.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ status: 'error', message: 'No GST record there.' });
    }
    return res.status(200).json({
      status: 'success',
      message: `GST details removed for ${row.stateName}`,
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * The registration an invoice should carry for a given state.
 *
 * Used by invoicing rather than by the admin screen. Returns null rather than
 * throwing when a state has none: an order can still be delivered somewhere
 * the business has not registered yet, and the invoice has to say something.
 */
export const gstForState = async (stateName) => {
  if (!stateName) return null;
  return StateGst.findOne({
    stateName: new RegExp(`^${String(stateName).trim()}$`, 'i'),
    isActive: true,
  }).lean();
};

export default { listStateGst, saveStateGst, deleteStateGst, gstForState };
