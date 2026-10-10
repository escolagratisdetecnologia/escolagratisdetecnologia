import { pullProgress, syncPending } from '../lib/progress-sync.ts';

// Every page: with a session, send what is pending and bring in what other devices saved.
void syncPending().then(() => pullProgress());
