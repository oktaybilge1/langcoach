// MAIN-world content script (document_start): observes lesson responses by wrapping window.fetch.
import { startMain } from './content/main';

startMain(window, { allowLocalhost: __E2E__ });
