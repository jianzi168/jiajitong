import { resolveQrImage } from '../src/utils/shareQr.js'

const downloaded = await resolveQrImage(
  { mode: 'wxacode', file_id: 'cloud://qr-1' },
  async (fileID) => {
    if (fileID !== 'cloud://qr-1') throw new Error('wrong id')
    return '/tmp/qr.png'
  },
)
if (downloaded !== '/tmp/qr.png') throw new Error('file id was not downloaded')

const placeholder = await resolveQrImage({ mode: 'placeholder' }, async () => '/tmp/no.png')
if (placeholder !== '') throw new Error('placeholder should stay empty')

const failed = await resolveQrImage(
  { mode: 'wxacode', file_id: 'cloud://bad' },
  async () => { throw new Error('offline') },
)
if (failed !== '') throw new Error('optional QR failure should degrade')

console.log('share QR tests passed')
