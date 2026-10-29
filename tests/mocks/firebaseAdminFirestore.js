// Stand-in for firebase-admin/firestore in unit tests. The real package is installed
// twice (root and functions/), so a mock registered by package name only applies to
// whichever copy the importing file resolves to. Mapping every import of it to this
// file makes the mock apply however node_modules is laid out.
export const getFirestore = () => {
  throw new Error('getFirestore must be mocked in unit tests');
};

export const FieldValue = { serverTimestamp: () => ({ _type: 'serverTimestamp' }) };
