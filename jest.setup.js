// Mock the AsyncStorage native module so pure-logic modules that import it
// (e.g. userProfileService) can be unit-tested under Node.
jest.mock(
    '@react-native-async-storage/async-storage',
    () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
