import { isSubscribeConfigured, UNAVAILABLE_COPY } from '../src/utils/featureAvailability.js'
if (isSubscribeConfigured([])) throw new Error('empty templates must be unavailable')
if (!UNAVAILABLE_COPY.delete.includes('未')) throw new Error('delete copy must disclose no submission')
console.log('placeholder feedback tests passed')
