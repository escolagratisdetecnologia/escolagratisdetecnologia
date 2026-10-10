/** ElectroDB wraps AWS SDK errors: the DynamoDB error is the cause. */
export const isConditionalCheckFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (error.cause as { name?: string } | undefined)?.name === 'ConditionalCheckFailedException';
