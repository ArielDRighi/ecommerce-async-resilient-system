/**
 * Global teardown for E2E tests
 * Runs once after all test suites
 */

export default async () => {
  // Small safety delay for any remaining background operations
  // Most tests should use QueueService.waitForActiveJobs() in their afterAll hooks
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // eslint-disable-next-line no-console
  console.log('\n✅ E2E Test Suite - Global Teardown');
  // eslint-disable-next-line no-console
  console.log('All tests completed!\n');
};
