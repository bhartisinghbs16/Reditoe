export const normalizeKycStatus = (status) => {
  if (status === 'approved' || status === 'rejected' || status === 'pending') {
    return status;
  }
  return 'pending';
};

export const getKycDisplayStatus = (status) => {
  const normalized = normalizeKycStatus(status);
  if (normalized === 'approved') return 'Verified';
  if (normalized === 'rejected') return 'Rejected';
  return 'Pending';
};

