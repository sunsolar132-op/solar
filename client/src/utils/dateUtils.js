/**
 * Formats a DD/MM/YY or YYYY-MM-DD string to DD/MM/YY for display
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  // Extract date portion if it is an ISO string with time
  if (dateStr.includes('T')) {
    dateStr = dateStr.split('T')[0];
  } else if (dateStr.includes(' ')) {
    dateStr = dateStr.split(' ')[0];
  }

  // If it's already in DD/MM/YY format (length 8), return it
  if (dateStr.includes('/') && dateStr.length <= 8) return dateStr;
  
  // If it's in YYYY-MM-DD format
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year.slice(-2)}`;
  }
  
  return dateStr;
};

/**
 * Converts YYYY-MM-DD (from input) to DD/MM/YY (for DB)
 */
export const toDBDate = (isoDate) => {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year.slice(-2)}`;
};

/**
 * Converts DD/MM/YY (from DB) to YYYY-MM-DD (for input)
 */
export const fromDBDate = (dbDate) => {
  if (!dbDate || !dbDate.includes('/')) return dbDate;
  const [day, month, yearShort] = dbDate.split('/');
  const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;
  return `${year}-${month}-${day}`;
};

/**
 * Returns current year for PO ID prefix
 */
export const curYear = () => new Date().getFullYear();

/**
 * Generates a specific SO ID: SO-YYYY-XXXX (last 4 of timestamp)
 */
export const genSoId = () => {
  const year = curYear();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SO-${year}-${rand}`;
};
