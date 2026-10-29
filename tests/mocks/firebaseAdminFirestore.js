// Stand-in for firebase-admin/firestore in unit tests. The real package is installed
// only in functions/ and is often absent (for example in CI). The moduleNameMapper
// entry in jest.config.js maps every import of it to this file, so the tests do not
// depend on whether functions/node_modules exists. Tests still register their own
// jest.fn doubles with jest.unstable_mockModule; this stub is the shared module path
// they attach to, and a fallback that fails loudly.
export const getFirestore = () => {
  throw new Error('getFirestore must be mocked in unit tests');
};

// A distinct marker, so code that reached this stub cannot be mistaken for a mocked path
export const FieldValue = { serverTimestamp: () => ({ _type: 'stub-serverTimestamp' }) };
