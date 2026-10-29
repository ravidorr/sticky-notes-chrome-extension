// Stand-in for firebase-admin/firestore in unit tests. The real package is installed
// twice (root and functions/), so a mock registered by package name only applies to
// whichever copy the importing file resolves to. Mapping every import of it to this
// file makes the mock apply however node_modules is laid out. Tests still register
// their own jest.fn doubles with jest.unstable_mockModule; this stub is the shared
// module path they attach to, and a fallback that fails loudly.
export const getFirestore = () => {
  throw new Error('getFirestore must be mocked in unit tests');
};

// A distinct marker, so code that reached this stub cannot be mistaken for a mocked path
export const FieldValue = { serverTimestamp: () => ({ _type: 'stub-serverTimestamp' }) };
