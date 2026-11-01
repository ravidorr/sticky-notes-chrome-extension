// Stand-in for firebase-admin/auth in unit tests, for the same reason as firebaseAdminFirestore.js:
// the real package is installed only in functions/. Tests register their own jest.fn double with
// jest.unstable_mockModule; this stub is the shared module path and a fallback that fails loudly.
export const getAuth = () => {
  throw new Error('getAuth must be mocked in unit tests');
};
