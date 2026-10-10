import { createMemoryProgressRepository } from '../src/index.ts';
import { describeProgressRepository } from './progress-contract.ts';

describeProgressRepository('memory', createMemoryProgressRepository);
