/**
 * Tax Calculator Utility
 * Calculates GST/CGST/SGST/IGST based on Indian tax rules
 */

export const calculateTax = (amount, address = {}) => {
  // Default tax rates (can be made configurable)
  const CGST_RATE = 2.5; // 2.5% CGST
  const SGST_RATE = 2.5; // 2.5% SGST
  const IGST_RATE = 5.0; // 5% IGST for inter-state
  
  // Determine if it's inter-state or intra-state
  const isInterState = isInterStateTransaction(address);
  
  let taxDetails = {
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    totalTax: 0
  };
  
  if (isInterState) {
    // Inter-state transaction - IGST only
    taxDetails.igstRate = IGST_RATE;
    taxDetails.igstAmount = (amount * IGST_RATE) / 100;
    taxDetails.totalTax = taxDetails.igstAmount;
  } else {
    // Intra-state transaction - CGST + SGST
    taxDetails.cgstRate = CGST_RATE;
    taxDetails.sgstRate = SGST_RATE;
    taxDetails.cgstAmount = (amount * CGST_RATE) / 100;
    taxDetails.sgstAmount = (amount * SGST_RATE) / 100;
    taxDetails.totalTax = taxDetails.cgstAmount + taxDetails.sgstAmount;
  }
  
  return taxDetails;
};

// Helper function to determine if transaction is inter-state
const isInterStateTransaction = (address) => {
  // Default state (can be configured based on business location)
  const businessState = 'Maharashtra'; // Example business location
  
  if (!address || !address.state) {
    return false; // Default to intra-state if address not available
  }
  
  // Normalize state names for comparison
  const normalizeState = (state) => state.toLowerCase().replace(/\s+/g, '');
  
  return normalizeState(address.state) !== normalizeState(businessState);
};

// Calculate tax for individual line item
export const calculateItemTax = (itemPrice, quantity, address = {}) => {
  const itemAmount = itemPrice * quantity;
  return calculateTax(itemAmount, address);
};

// Get tax breakdown for invoice
export const getInvoiceTaxBreakdown = (lineItems, address = {}) => {
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  
  lineItems.forEach(item => {
    const taxDetails = calculateItemTax(item.unitPrice, item.quantity, address);
    totalCgst += taxDetails.cgstAmount;
    totalSgst += taxDetails.sgstAmount;
    totalIgst += taxDetails.igstAmount;
  });
  
  return {
    cgstAmount: totalCgst,
    sgstAmount: totalSgst,
    igstAmount: totalIgst,
    totalTax: totalCgst + totalSgst + totalIgst
  };
};
